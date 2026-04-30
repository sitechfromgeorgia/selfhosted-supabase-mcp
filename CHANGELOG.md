# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.1] - 2026-04-30

### Added
- **83 New Tools across Phases 1-11**:
  - Phase 1: DDL & Schema Management (12 tools)
  - Phase 2: Storage File Operations (10 tools)
  - Phase 3: Auth at Scale (14 tools)
  - Phase 4: Vector / AI Operations (6 tools)
  - Phase 5: Edge Function Deployment (6 tools)
  - Phase 6: Realtime Management (6 tools)
  - Phase 7: Backup & Maintenance (7 tools)
  - Phase 8: RLS Policy Management (6 tools)
  - Phase 9: Performance & Monitoring (8 tools)
  - Phase 10: Batch Data Operations (7 tools)
  - Phase 11: Final Polish (2 tools)
- **External Access Support**: Works without `DATABASE_URL` via Supabase Admin API, Storage API, and service_role RPC fallback
- **Supabase Admin API Fallback**: Auth tools (`list_auth_users`, `get_auth_user`, `create_auth_user`, etc.) fallback to `auth.admin.*` when direct DB unavailable
- **Storage API Fallback**: Storage listing tools fallback to `storage.*` API when direct DB unavailable
- **Total: 126 tools, 504 tests passing**

### Fixed
- Zod v4 compatibility: `z.record(z.any())` → `z.record(z.string(), z.any())`
- Schema parameter defaults for undefined values in batch/vector/DDL tools
- Edge function slug validation to allow hyphens
- All TypeScript compilation errors (0 errors)
- All test failures (504 pass, 0 fail)

## [Unreleased]

### Security
- **CVE-2026-25536 Patch**: Updated `@modelcontextprotocol/sdk` from `^1.25.2` to `^1.27.1` to fix cross-client data leak vulnerability in StreamableHTTPServerTransport (CVSS 7.1)
- **SQL Injection Fix**: Replaced string-interpolated `LIMIT` clauses in `get_logs.ts` with parameterized queries (`$1`) via updated `executeSqlWithFallback` and `executeSqlWithPg`

### Added
- **MCP Resources Support**: New `database://schema/{schema}/tables/{table}`, `database://function/{name}`, and `database://rls/{schema}/{table}` resources for direct schema introspection
- **MCP Prompts Support**: Added `analyze-slow-queries`, `audit-security`, `migration-review`, and `optimize-indexes` prompt templates
- **`defineTool` Helper**: New `src/tools/define-tool.ts` utility that auto-generates `mcpInputSchema` from Zod schemas using Zod v4's built-in `toJSONSchema`
- **Connection Pool Management**: Added `healthCheck()` and `close()` methods to `SelfhostedSupabaseClient` for graceful shutdown
- **RBAC Unit Tests**: Added comprehensive tests for `canAccessTool()` covering `service_role`, `authenticated`, `anon`, and unknown roles
- **HTTP Server Integration Tests**: Added tests for health check, CORS, security headers, rate limiting, JWT auth, and stateless mode behavior
- **Tool-Specific Tests**: Added tests for `explain_query` (write query detection, ANALYZE warnings) and `get_auth_user` (user lookup, not-found, invalid UUID)
- **GitHub Actions CI**: Added `.github/workflows/ci.yml` with typecheck, test, build, and security audit jobs

### Changed
- **Dockerfile**: Rewrote to use `oven/bun:1.1-alpine` instead of `node:lts-alpine`, aligning with project's Bun runtime migration
- **Health Check Endpoint**: Now includes `timestamp` in response
- **Shutdown Handlers**: Both HTTP and stdio modes now gracefully close the pg connection pool on SIGINT/SIGTERM
- **Version Sync**: `package.json` version bumped from `1.2.0` to `1.3.0` to match `src/index.ts`

### Fixed
- **Missing Dependency**: Removed unused `zod-to-json-schema` import from `src/index.ts` (Zod v4 has built-in support)
- **Parameterized Queries**: `executeSqlWithPg` and `executeSqlWithFallback` now support optional `params` array for safe parameterized queries

### Added

- **HTTP Transport Mode**: Run MCP server in HTTP mode for Docker/Kong integration
  - Express-based HTTP server with Streamable HTTP Transport
  - Configurable CORS, rate limiting, and request timeouts
  - Health check endpoint for container orchestration
- **JWT Authentication Middleware**: Validate Supabase JWTs in HTTP mode
- **Privilege-Based Access Control**: Role-based tool access (regular, privileged)
  - `service_role`: Access to all tools
  - `authenticated`/`anon`: Access to regular tools only
- **24 New Database Introspection Tools**:
  - Schema: `list_table_columns`, `list_indexes`, `list_constraints`, `list_foreign_keys`, `list_triggers`, `list_database_functions`, `list_available_extensions`
  - Security: `list_rls_policies`, `get_rls_status`, `get_advisors`
  - Definitions: `get_function_definition`, `get_trigger_definition`
  - Performance: `get_index_stats`, `get_vector_index_stats`, `explain_query`
  - Extensions: `list_cron_jobs`, `get_cron_job_history`, `list_vector_indexes`
  - Edge Functions: `list_edge_functions`, `get_edge_function_details`, `list_edge_function_logs`
  - Storage: `get_storage_config`, `update_storage_config`
  - Logs: `get_logs`
- **Bun Runtime**: Migrated from Node.js/npm to Bun for faster builds and execution
- **Comprehensive Test Suite**: 13 test files with 240+ passing tests
- **Docker Integration**: Dockerfile and Docker Compose configuration for self-hosted Supabase stacks

### Changed

- `execute_sql` now requires `service_role` JWT in HTTP mode (privileged tool)
- Replaced `package-lock.json` with `bun.lock`

### Removed

- **`get_anon_key` tool**: Removed to prevent exposure of sensitive API keys through MCP
- **`get_service_key` tool**: Removed to prevent exposure of sensitive API keys through MCP

### Security

- Removed tools that exposed API keys (`get_anon_key`, `get_service_key`)
  - **Rationale**: MCP tools can be called by any connected client. Exposing API keys through MCP creates a security risk where keys could be extracted by malicious or compromised MCP clients. The anon key and service role key are already available to the server at startup via environment variables or CLI arguments - there's no legitimate use case for retrieving them via MCP during runtime.
- Added privilege-based access control to restrict sensitive operations to `service_role` only
- JWT authentication enforced for all HTTP mode requests
