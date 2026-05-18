#!/bin/bash
# =============================================================================
# Private AI Knowledge Assistant — Database Migration Script
# Runs Alembic migrations as a one-off ECS Fargate task.
# Usage: ./migrate.sh [dev|staging|prod] [--dry-run] [--revision <rev>]
# Requires: aws-cli v2, jq
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
ENVIRONMENT="${1:-dev}"
DRY_RUN=false
REVISION="head"

# Parse optional flags
shift || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --revision)
      REVISION="${2:?--revision requires a value}"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [dev|staging|prod] [--dry-run] [--revision <rev>]"
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env.${ENVIRONMENT}"
if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
fi

: "${AWS_REGION:?AWS_REGION is required}"
: "${ECS_CLUSTER:?ECS_CLUSTER is required}"
: "${ECS_SERVICE:=private-ai-assistant}"

# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------
log()     { echo "[$(date +'%Y-%m-%dT%H:%M:%S')] INFO  $*"; }
error()   { echo "[$(date +'%Y-%m-%dT%H:%M:%S')] ERROR $*" >&2; }
success() { echo "[$(date +'%Y-%m-%dT%H:%M:%S')] OK    $*"; }

# ---------------------------------------------------------------------------
# Resolve current task definition and network config from the running service
# ---------------------------------------------------------------------------
get_service_config() {
  log "Fetching ECS service configuration..."

  TASK_DEF_ARN="$(aws ecs describe-services \
    --cluster "${ECS_CLUSTER}" \
    --services "${ECS_SERVICE}" \
    --region "${AWS_REGION}" \
    --query 'services[0].taskDefinition' \
    --output text)"

  if [[ -z "${TASK_DEF_ARN}" ]] || [[ "${TASK_DEF_ARN}" == "None" ]]; then
    error "Could not resolve task definition for service '${ECS_SERVICE}' in cluster '${ECS_CLUSTER}'"
    exit 1
  fi

  SUBNETS="$(aws ecs describe-services \
    --cluster "${ECS_CLUSTER}" \
    --services "${ECS_SERVICE}" \
    --region "${AWS_REGION}" \
    --query 'services[0].networkConfiguration.awsvpcConfiguration.subnets' \
    --output json)"

  SECURITY_GROUPS="$(aws ecs describe-services \
    --cluster "${ECS_CLUSTER}" \
    --services "${ECS_SERVICE}" \
    --region "${AWS_REGION}" \
    --query 'services[0].networkConfiguration.awsvpcConfiguration.securityGroups' \
    --output json)"

  log "Task definition : ${TASK_DEF_ARN}"
  log "Subnets         : ${SUBNETS}"
  log "Security groups : ${SECURITY_GROUPS}"
}

# ---------------------------------------------------------------------------
# Run the migration command
# ---------------------------------------------------------------------------
run_migration() {
  local alembic_command
  if [[ "${DRY_RUN}" == "true" ]]; then
    alembic_command='["alembic", "upgrade", "--sql", "'"${REVISION}"'"]'
    log "DRY RUN: would execute: alembic upgrade --sql ${REVISION}"
  else
    alembic_command='["alembic", "upgrade", "'"${REVISION}"'"]'
    log "Executing: alembic upgrade ${REVISION}"
  fi

  log "Starting one-off ECS migration task..."

  local network_config="{\"awsvpcConfiguration\":{\"subnets\":${SUBNETS},\"securityGroups\":${SECURITY_GROUPS},\"assignPublicIp\":\"DISABLED\"}}"

  local overrides="{\"containerOverrides\":[{\"name\":\"backend\",\"command\":${alembic_command}}]}"

  local task_response
  task_response="$(aws ecs run-task \
    --cluster "${ECS_CLUSTER}" \
    --task-definition "${TASK_DEF_ARN}" \
    --launch-type FARGATE \
    --network-configuration "${network_config}" \
    --overrides "${overrides}" \
    --started-by "migration-script" \
    --region "${AWS_REGION}" \
    --output json)"

  local task_arn
  task_arn="$(echo "${task_response}" | jq -r '.tasks[0].taskArn // empty')"

  if [[ -z "${task_arn}" ]]; then
    local failure_reason
    failure_reason="$(echo "${task_response}" | jq -r '.failures[0].reason // "unknown"')"
    error "Failed to start ECS task: ${failure_reason}"
    exit 1
  fi

  log "Migration task ARN: ${task_arn}"
  log "Waiting for task to complete (this may take a few minutes)..."

  aws ecs wait tasks-stopped \
    --cluster "${ECS_CLUSTER}" \
    --tasks "${task_arn}" \
    --region "${AWS_REGION}"

  # Inspect exit code
  local task_details
  task_details="$(aws ecs describe-tasks \
    --cluster "${ECS_CLUSTER}" \
    --tasks "${task_arn}" \
    --region "${AWS_REGION}" \
    --query 'tasks[0]')"

  local exit_code stop_reason
  exit_code="$(echo "${task_details}" | jq -r '.containers[0].exitCode // -1')"
  stop_reason="$(echo "${task_details}" | jq -r '.stoppedReason // "unknown"')"
  local stopped_at
  stopped_at="$(echo "${task_details}" | jq -r '.stoppedAt // "unknown"')"

  log "Task stopped at: ${stopped_at}"
  log "Stop reason    : ${stop_reason}"
  log "Exit code      : ${exit_code}"

  if [[ "${exit_code}" -ne 0 ]]; then
    error "Migration task failed with exit code: ${exit_code}"
    error "Stop reason: ${stop_reason}"

    # Fetch recent CloudWatch logs for debugging
    local log_group="/ecs/private-ai-assistant/backend"
    local log_stream_prefix
    log_stream_prefix="ecs/backend/$(basename "${task_arn}")"
    log "Fetching last 50 log lines from CloudWatch: ${log_group}/${log_stream_prefix}"

    aws logs get-log-events \
      --log-group-name "${log_group}" \
      --log-stream-name "${log_stream_prefix}" \
      --limit 50 \
      --region "${AWS_REGION}" \
      --query 'events[].message' \
      --output text 2>/dev/null || warn "Could not fetch CloudWatch logs"

    exit 1
  fi

  success "Migration completed successfully (exit code: ${exit_code})"
}

# ---------------------------------------------------------------------------
# Show current migration status (alembic current)
# ---------------------------------------------------------------------------
show_migration_status() {
  log "Fetching current migration revision..."

  local network_config="{\"awsvpcConfiguration\":{\"subnets\":${SUBNETS},\"securityGroups\":${SECURITY_GROUPS},\"assignPublicIp\":\"DISABLED\"}}"

  local task_response
  task_response="$(aws ecs run-task \
    --cluster "${ECS_CLUSTER}" \
    --task-definition "${TASK_DEF_ARN}" \
    --launch-type FARGATE \
    --network-configuration "${network_config}" \
    --overrides '{"containerOverrides":[{"name":"backend","command":["alembic","current"]}]}' \
    --started-by "migration-script-status" \
    --region "${AWS_REGION}" \
    --output json)"

  local task_arn
  task_arn="$(echo "${task_response}" | jq -r '.tasks[0].taskArn // empty')"

  if [[ -z "${task_arn}" ]]; then
    warn "Could not start status task"
    return
  fi

  aws ecs wait tasks-stopped \
    --cluster "${ECS_CLUSTER}" \
    --tasks "${task_arn}" \
    --region "${AWS_REGION}"

  log "Migration status task completed: ${task_arn}"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
  echo "============================================================"
  echo " Private AI — Database Migrations"
  echo " Environment : ${ENVIRONMENT}"
  echo " Revision    : ${REVISION}"
  echo " Dry run     : ${DRY_RUN}"
  echo " AWS Region  : ${AWS_REGION}"
  echo " ECS Cluster : ${ECS_CLUSTER}"
  echo "============================================================"

  # Verify AWS credentials
  if ! aws sts get-caller-identity --region "${AWS_REGION}" &>/dev/null; then
    error "AWS credentials are not configured or have expired."
    exit 1
  fi

  get_service_config
  show_migration_status
  run_migration
  show_migration_status

  echo ""
  echo "============================================================"
  success "Migration to '${REVISION}' COMPLETE on ${ENVIRONMENT}!"
  echo "============================================================"
}

main "$@"
