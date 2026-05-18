#!/bin/bash
# =============================================================================
# Private AI Knowledge Assistant — Deployment Script
# Usage: ./deploy.sh [dev|staging|prod]
# Requires: aws-cli v2, docker, jq, curl
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
ENVIRONMENT="${1:-dev}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
IMAGE_TAG="${GIT_SHA}-${TIMESTAMP}"

# Validate environment
case "${ENVIRONMENT}" in
  dev|staging|prod) ;;
  *)
    echo "ERROR: Invalid environment '${ENVIRONMENT}'. Use: dev, staging, or prod"
    exit 1
    ;;
esac

# Load environment-specific configuration
ENV_FILE="${SCRIPT_DIR}/.env.${ENVIRONMENT}"
if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
fi

# Required variables
: "${AWS_REGION:?AWS_REGION is required}"
: "${ECR_REGISTRY:?ECR_REGISTRY is required}"
: "${ECS_CLUSTER:?ECS_CLUSTER is required}"
: "${ECS_SERVICE:=private-ai-assistant}"

BACKEND_IMAGE="${ECR_REGISTRY}/private-ai-backend:${IMAGE_TAG}"
FRONTEND_IMAGE="${ECR_REGISTRY}/private-ai-frontend:${IMAGE_TAG}"

# ---------------------------------------------------------------------------
# Utility functions
# ---------------------------------------------------------------------------
log()     { echo "[$(date +'%Y-%m-%dT%H:%M:%S')] INFO  $*"; }
warn()    { echo "[$(date +'%Y-%m-%dT%H:%M:%S')] WARN  $*" >&2; }
error()   { echo "[$(date +'%Y-%m-%dT%H:%M:%S')] ERROR $*" >&2; }
success() { echo "[$(date +'%Y-%m-%dT%H:%M:%S')] OK    $*"; }

check_prerequisites() {
  log "Checking prerequisites..."
  local missing=0
  for cmd in aws docker jq curl; do
    if ! command -v "${cmd}" &>/dev/null; then
      error "Required command not found: ${cmd}"
      missing=1
    fi
  done
  if [[ ${missing} -ne 0 ]]; then
    error "Install missing prerequisites and retry."
    exit 1
  fi

  # Check AWS credentials
  if ! aws sts get-caller-identity --region "${AWS_REGION}" &>/dev/null; then
    error "AWS credentials are not configured or have expired."
    exit 1
  fi

  success "Prerequisites OK"
}

notify_slack() {
  local status="$1"
  local message="$2"
  if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
    local color
    color="$([ "${status}" = "success" ] && echo "good" || echo "danger")"
    curl -s -X POST "${SLACK_WEBHOOK_URL}" \
      -H "Content-Type: application/json" \
      -d "{
        \"attachments\": [{
          \"color\": \"${color}\",
          \"title\": \"Private AI Deployment — ${ENVIRONMENT}\",
          \"text\": \"${message}\",
          \"fields\": [
            {\"title\": \"Environment\", \"value\": \"${ENVIRONMENT}\", \"short\": true},
            {\"title\": \"Git SHA\", \"value\": \"${GIT_SHA}\", \"short\": true},
            {\"title\": \"Image Tag\", \"value\": \"${IMAGE_TAG}\", \"short\": true}
          ]
        }]
      }" || warn "Slack notification failed (non-fatal)"
  fi
}

cleanup_on_exit() {
  local exit_code=$?
  if [[ ${exit_code} -ne 0 ]]; then
    error "Deployment FAILED (exit code: ${exit_code})"
    notify_slack "failure" "Deployment failed at step: ${CURRENT_STEP:-unknown}. Git SHA: ${GIT_SHA}"
  fi
}

trap cleanup_on_exit EXIT

# ---------------------------------------------------------------------------
# Step 1: ECR login
# ---------------------------------------------------------------------------
ecr_login() {
  CURRENT_STEP="ecr_login"
  log "Step 1/9 — Authenticating with ECR..."
  aws ecr get-login-password --region "${AWS_REGION}" \
    | docker login --username AWS --password-stdin "${ECR_REGISTRY}"
  success "ECR login successful"
}

# ---------------------------------------------------------------------------
# Step 2: Build Docker images
# ---------------------------------------------------------------------------
build_images() {
  CURRENT_STEP="build_images"
  log "Step 2/9 — Building Docker images (tag: ${IMAGE_TAG})..."

  # Build backend
  docker build \
    --target production \
    --build-arg BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --build-arg GIT_SHA="${GIT_SHA}" \
    --label "org.opencontainers.image.revision=${GIT_SHA}" \
    --label "org.opencontainers.image.created=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    -t "${BACKEND_IMAGE}" \
    -t "${ECR_REGISTRY}/private-ai-backend:latest" \
    "${PROJECT_ROOT}/backend"

  # Build frontend
  docker build \
    --target runner \
    --build-arg NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-}" \
    --build-arg NEXT_PUBLIC_APP_NAME="Private AI Assistant" \
    --build-arg NEXT_PUBLIC_APP_URL="${NEXT_PUBLIC_APP_URL:-}" \
    --label "org.opencontainers.image.revision=${GIT_SHA}" \
    --label "org.opencontainers.image.created=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    -t "${FRONTEND_IMAGE}" \
    -t "${ECR_REGISTRY}/private-ai-frontend:latest" \
    "${PROJECT_ROOT}/frontend"

  success "Images built successfully"
}

# ---------------------------------------------------------------------------
# Step 3: Push images to ECR
# ---------------------------------------------------------------------------
push_images() {
  CURRENT_STEP="push_images"
  log "Step 3/9 — Pushing images to ECR..."
  docker push "${BACKEND_IMAGE}"
  docker push "${ECR_REGISTRY}/private-ai-backend:latest"
  docker push "${FRONTEND_IMAGE}"
  docker push "${ECR_REGISTRY}/private-ai-frontend:latest"
  success "Images pushed to ECR"
}

# ---------------------------------------------------------------------------
# Step 4: Run database migrations
# ---------------------------------------------------------------------------
run_migrations() {
  CURRENT_STEP="run_migrations"
  log "Step 4/9 — Running database migrations..."

  # Register a one-off migration task
  local task_def_arn
  task_def_arn="$(aws ecs describe-task-definition \
    --task-definition private-ai-assistant \
    --region "${AWS_REGION}" \
    --query 'taskDefinition.taskDefinitionArn' \
    --output text)"

  local subnets security_groups
  subnets="$(aws ecs describe-services \
    --cluster "${ECS_CLUSTER}" \
    --services "${ECS_SERVICE}" \
    --region "${AWS_REGION}" \
    --query 'services[0].networkConfiguration.awsvpcConfiguration.subnets' \
    --output json)"

  security_groups="$(aws ecs describe-services \
    --cluster "${ECS_CLUSTER}" \
    --services "${ECS_SERVICE}" \
    --region "${AWS_REGION}" \
    --query 'services[0].networkConfiguration.awsvpcConfiguration.securityGroups' \
    --output json)"

  local task_arn
  task_arn="$(aws ecs run-task \
    --cluster "${ECS_CLUSTER}" \
    --task-definition "${task_def_arn}" \
    --launch-type FARGATE \
    --network-configuration "{\"awsvpcConfiguration\":{\"subnets\":${subnets},\"securityGroups\":${security_groups},\"assignPublicIp\":\"DISABLED\"}}" \
    --overrides '{"containerOverrides":[{"name":"backend","command":["alembic","upgrade","head"]}]}' \
    --region "${AWS_REGION}" \
    --query 'tasks[0].taskArn' \
    --output text)"

  if [[ -z "${task_arn}" ]] || [[ "${task_arn}" == "None" ]]; then
    error "Failed to start migration task"
    exit 1
  fi

  log "Migration task started: ${task_arn}"
  log "Waiting for migration to complete..."

  aws ecs wait tasks-stopped \
    --cluster "${ECS_CLUSTER}" \
    --tasks "${task_arn}" \
    --region "${AWS_REGION}"

  local exit_code
  exit_code="$(aws ecs describe-tasks \
    --cluster "${ECS_CLUSTER}" \
    --tasks "${task_arn}" \
    --region "${AWS_REGION}" \
    --query 'tasks[0].containers[0].exitCode' \
    --output text)"

  if [[ "${exit_code}" != "0" ]]; then
    error "Migration task failed with exit code: ${exit_code}"
    exit 1
  fi

  success "Database migrations completed successfully"
}

# ---------------------------------------------------------------------------
# Step 5: Update ECS task definition with new images
# ---------------------------------------------------------------------------
update_task_definition() {
  CURRENT_STEP="update_task_definition"
  log "Step 5/9 — Updating ECS task definition with new images..."

  # Get current task definition
  local task_def
  task_def="$(aws ecs describe-task-definition \
    --task-definition private-ai-assistant \
    --region "${AWS_REGION}" \
    --query 'taskDefinition')"

  # Update image URIs
  local new_task_def
  new_task_def="$(echo "${task_def}" | jq \
    --arg backend_image "${BACKEND_IMAGE}" \
    --arg frontend_image "${FRONTEND_IMAGE}" \
    '
    .containerDefinitions |= map(
      if .name == "backend" then .image = $backend_image
      elif .name == "frontend" then .image = $frontend_image
      else . end
    ) |
    {
      family: .family,
      networkMode: .networkMode,
      requiresCompatibilities: .requiresCompatibilities,
      cpu: .cpu,
      memory: .memory,
      taskRoleArn: .taskRoleArn,
      executionRoleArn: .executionRoleArn,
      containerDefinitions: .containerDefinitions
    }
    ')"

  # Register updated task definition
  NEW_TASK_DEF_ARN="$(aws ecs register-task-definition \
    --region "${AWS_REGION}" \
    --cli-input-json "${new_task_def}" \
    --query 'taskDefinition.taskDefinitionArn' \
    --output text)"

  log "New task definition: ${NEW_TASK_DEF_ARN}"
  success "Task definition updated"
}

# ---------------------------------------------------------------------------
# Step 6: Deploy ECS service
# ---------------------------------------------------------------------------
deploy_service() {
  CURRENT_STEP="deploy_service"
  log "Step 6/9 — Deploying ECS service..."

  aws ecs update-service \
    --cluster "${ECS_CLUSTER}" \
    --service "${ECS_SERVICE}" \
    --task-definition "${NEW_TASK_DEF_ARN}" \
    --force-new-deployment \
    --region "${AWS_REGION}" \
    --output json > /dev/null

  success "ECS service update initiated"
}

# ---------------------------------------------------------------------------
# Step 7: Wait for deployment to stabilize
# ---------------------------------------------------------------------------
wait_for_deployment() {
  CURRENT_STEP="wait_for_deployment"
  log "Step 7/9 — Waiting for deployment to stabilize (timeout: 10 min)..."

  local max_wait=600
  local elapsed=0
  local poll_interval=15

  while [[ ${elapsed} -lt ${max_wait} ]]; do
    local deployment_status
    deployment_status="$(aws ecs describe-services \
      --cluster "${ECS_CLUSTER}" \
      --services "${ECS_SERVICE}" \
      --region "${AWS_REGION}" \
      --query 'services[0].deployments[0]' \
      --output json)"

    local running_count pending_count rollout_status
    running_count="$(echo "${deployment_status}" | jq -r '.runningCount')"
    pending_count="$(echo "${deployment_status}" | jq -r '.pendingCount')"
    rollout_status="$(echo "${deployment_status}" | jq -r '.rolloutState')"

    log "Deployment status: ${rollout_status} — running=${running_count}, pending=${pending_count}"

    case "${rollout_status}" in
      COMPLETED)
        success "Deployment completed successfully"
        return 0
        ;;
      FAILED)
        error "Deployment FAILED — ECS circuit breaker triggered"
        return 1
        ;;
    esac

    sleep ${poll_interval}
    elapsed=$((elapsed + poll_interval))
  done

  error "Deployment timed out after ${max_wait}s"
  return 1
}

# ---------------------------------------------------------------------------
# Step 8: Health check
# ---------------------------------------------------------------------------
health_check() {
  CURRENT_STEP="health_check"
  log "Step 8/9 — Running health checks..."

  local health_url="${HEALTH_CHECK_URL:-}"
  if [[ -z "${health_url}" ]] && [[ -n "${ALB_DNS:-}" ]]; then
    health_url="https://${ALB_DNS}/health"
  fi

  if [[ -z "${health_url}" ]]; then
    warn "HEALTH_CHECK_URL not set, skipping HTTP health check"
    return 0
  fi

  local max_attempts=10
  local attempt=0
  local wait_seconds=15

  while [[ ${attempt} -lt ${max_attempts} ]]; do
    attempt=$((attempt + 1))
    log "Health check attempt ${attempt}/${max_attempts}: ${health_url}"

    local http_status
    http_status="$(curl -s -o /dev/null -w "%{http_code}" \
      --max-time 10 \
      --retry 0 \
      "${health_url}" 2>/dev/null || echo "000")"

    if [[ "${http_status}" == "200" ]]; then
      success "Health check passed (HTTP ${http_status})"
      return 0
    fi

    warn "Health check returned HTTP ${http_status}, retrying in ${wait_seconds}s..."
    sleep ${wait_seconds}
  done

  error "Health check failed after ${max_attempts} attempts"
  return 1
}

# ---------------------------------------------------------------------------
# Step 9: Cleanup old task definitions (keep last 5)
# ---------------------------------------------------------------------------
cleanup_old_task_definitions() {
  CURRENT_STEP="cleanup_old_task_definitions"
  log "Step 9/9 — Cleaning up old task definitions..."

  local task_def_arns
  task_def_arns="$(aws ecs list-task-definitions \
    --family-prefix private-ai-assistant \
    --status ACTIVE \
    --sort DESC \
    --region "${AWS_REGION}" \
    --query 'taskDefinitionArns[5:]' \
    --output json)"

  local count
  count="$(echo "${task_def_arns}" | jq length)"

  if [[ "${count}" -gt 0 ]]; then
    echo "${task_def_arns}" | jq -r '.[]' | while read -r arn; do
      aws ecs deregister-task-definition \
        --task-definition "${arn}" \
        --region "${AWS_REGION}" \
        --output json > /dev/null
      log "Deregistered: ${arn}"
    done
    success "Cleaned up ${count} old task definition(s)"
  else
    log "No old task definitions to clean up"
  fi
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
  echo "============================================================"
  echo " Private AI Knowledge Assistant — Deployment"
  echo " Environment : ${ENVIRONMENT}"
  echo " Git SHA     : ${GIT_SHA}"
  echo " Image Tag   : ${IMAGE_TAG}"
  echo " AWS Region  : ${AWS_REGION}"
  echo " ECS Cluster : ${ECS_CLUSTER}"
  echo "============================================================"

  notify_slack "info" "Deployment started. Git SHA: ${GIT_SHA}, Tag: ${IMAGE_TAG}"

  check_prerequisites
  ecr_login
  build_images
  push_images
  update_task_definition
  deploy_service
  wait_for_deployment
  run_migrations
  health_check
  cleanup_old_task_definitions

  echo ""
  echo "============================================================"
  success "Deployment to ${ENVIRONMENT} COMPLETE!"
  echo " Image Tag   : ${IMAGE_TAG}"
  echo " Deployed at : $(date -u)"
  echo "============================================================"

  notify_slack "success" "Deployment to ${ENVIRONMENT} succeeded! Tag: ${IMAGE_TAG}"
}

main "$@"
