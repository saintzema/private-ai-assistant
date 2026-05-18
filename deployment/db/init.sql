-- PostgreSQL initialization script for Private AI Knowledge Assistant
-- This runs on first startup of the PostgreSQL container

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- for fuzzy text search

-- Create the database if running outside docker
-- CREATE DATABASE private_ai;

-- Performance settings (apply at session level for init)
-- These are better set in postgresql.conf for production:
--   shared_buffers = 256MB
--   effective_cache_size = 1GB
--   maintenance_work_mem = 64MB
--   checkpoint_completion_target = 0.9
--   wal_buffers = 16MB
--   random_page_cost = 1.1 (for SSD)

COMMENT ON DATABASE private_ai IS 'Private AI Knowledge Assistant - Multi-tenant SaaS database';
