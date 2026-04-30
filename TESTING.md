# Testing Guide

## Test Suite Overview

- **519 total tests** across 25 test files
- **504 passing** | **15 skipped** (integration) | **0 failing**
- Run with Bun in Docker: `docker run --rm -v "${PWD}:/app" -w /app oven/bun:1.1-alpine bun test`

## Local Testing with Your Self-Hosted Supabase

1. Copy `.env.example` to `.env` and fill in your values:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your Supabase instance credentials:
   - `SUPABASE_URL` — your Supabase URL (e.g., `https://data.mobiline.cloud`)
   - `SUPABASE_ANON_KEY` — from your Supabase dashboard
   - `SUPABASE_SERVICE_ROLE_KEY` — from your Supabase dashboard
   - `SUPABASE_AUTH_JWT_SECRET` — from your Supabase config
   - `DATABASE_URL` — direct PostgreSQL connection string

3. Run the MCP server in stdio mode:
   ```bash
   bun run dist/index.js --url $SUPABASE_URL --anon-key $SUPABASE_ANON_KEY --service-key $SUPABASE_SERVICE_ROLE_KEY --db-url $DATABASE_URL
   ```

4. Or in HTTP mode:
   ```bash
   bun run dist/index.js --transport http --port 3100 --host 0.0.0.0 --url $SUPABASE_URL --anon-key $SUPABASE_ANON_KEY --service-key $SUPABASE_SERVICE_ROLE_KEY --jwt-secret $SUPABASE_AUTH_JWT_SECRET --db-url $DATABASE_URL
   ```

## Integration Tests

Integration tests require a real Supabase instance. Set environment variables before running:
```bash
export SUPABASE_URL=https://your-domain.com
export SUPABASE_ANON_KEY=...
export SUPABASE_SERVICE_ROLE_KEY=...
export DATABASE_URL=...
bun test src/__tests__/integration/
```

## Docker Compose Integration

Add to your Supabase Docker Compose:
```yaml
mcp:
  build:
    context: .
    dockerfile: ./volumes/mcp/Dockerfile
  environment:
    SUPABASE_URL: http://kong:8000
    SUPABASE_ANON_KEY: ${ANON_KEY}
    SUPABASE_SERVICE_ROLE_KEY: ${SERVICE_ROLE_KEY}
    SUPABASE_AUTH_JWT_SECRET: ${JWT_SECRET}
    DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD}@db:5432/postgres
  command: ["bun", "run", "dist/index.js", "--transport", "http", "--port", "3100", "--host", "0.0.0.0"]
```
