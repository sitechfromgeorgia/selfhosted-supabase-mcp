# Self-Hosted Supabase MCP Server — Comprehensive Development Plan

> **Vision**: Build the most complete, production-ready MCP server for Supabase that works seamlessly with both self-hosted and cloud instances, enabling AI agents to fully manage databases, auth, storage, realtime, edge functions, and AI/vector operations.

---

## Current State (v1.3.0)

- **43 tools** implemented
- **240+ tests** passing
- **HTTP + stdio transports** with JWT auth
- **RBAC**: `service_role` / `authenticated` / `anon`
- **MCP Resources + Prompts** support
- **CVE-patched** SDK v1.27.1
- **CI/CD** with GitHub Actions

---

## Phase 1: Critical Foundation — Schema & DDL Management

> **Goal**: AI agent must create, modify, and drop database schema without writing raw SQL.

| Tool | Description | Privilege | Priority |
|------|-------------|-----------|----------|
| `create_table` | Create table with columns, types, constraints, PK | Privileged | 🔴 Critical |
| `alter_table` | Add/drop/modify/rename columns | Privileged | 🔴 Critical |
| `drop_table` | Safe drop with CASCADE/IF EXISTS guards | Privileged | 🔴 Critical |
| `rename_table` | Rename table with FK updates | Privileged | 🔴 Critical |
| `create_index` | Create index with CONCURRENTLY for large tables | Privileged | 🔴 Critical |
| `drop_index` | Safe index removal | Privileged | 🔴 Critical |
| `create_schema` | Create new schema | Privileged | 🟠 High |
| `drop_schema` | Drop schema with CASCADE option | Privileged | 🟠 High |
| `add_foreign_key` | Add FK constraint with validation | Privileged | 🟠 High |
| `drop_foreign_key` | Remove FK constraint | Privileged | 🟠 High |
| `create_sequence` | Create sequence for auto-increment | Privileged | 🟡 Medium |
| `set_column_default` | Set/remove column defaults | Privileged | 🟡 Medium |

**Safety Features**:
- Identifier validation (`/^[a-zA-Z_][a-zA-Z0-9_$]*$/`)
- Warn on missing primary key
- Warn on reserved PostgreSQL keywords
- Suggest index on foreign key columns
- Dry-run mode (preview SQL without executing)

---

## Phase 2: Storage File Operations

> **Goal**: Full file lifecycle management — upload, download, delete, move.

| Tool | Description | Privilege | Priority |
|------|-------------|-----------|----------|
| `create_storage_bucket` | Create bucket with policies | Privileged | 🔴 Critical |
| `delete_storage_bucket` | Remove bucket + contents | Privileged | 🔴 Critical |
| `upload_file` | Upload base64/bytes to bucket | Privileged | 🔴 Critical |
| `download_file` | Retrieve file contents | Regular | 🔴 Critical |
| `delete_storage_object` | Remove specific file | Privileged | 🔴 Critical |
| `move_storage_object` | Rename/move within/across buckets | Privileged | 🟠 High |
| `copy_storage_object` | Duplicate files | Privileged | 🟠 High |
| `get_storage_object_metadata` | Size, MIME, headers | Regular | 🟠 High |
| `create_signed_url` | Time-limited access URL | Privileged | 🟠 High |
| `empty_storage_bucket` | Bulk delete all objects | Privileged | 🟡 Medium |

---

## Phase 3: Auth at Scale

> **Goal**: Manage thousands of users, send emails, handle sessions.

| Tool | Description | Privilege | Priority |
|------|-------------|-----------|----------|
| `bulk_create_auth_users` | Batch user creation from array | Privileged | 🔴 Critical |
| `bulk_delete_auth_users` | Batch deletion by IDs/filter | Privileged | 🔴 Critical |
| `bulk_update_auth_users` | Batch metadata/role updates | Privileged | 🔴 Critical |
| `send_password_reset` | Trigger password reset email | Privileged | 🔴 Critical |
| `invite_user` | Send magic link invitation | Privileged | 🔴 Critical |
| `confirm_user_email` | Manually confirm email | Privileged | 🟠 High |
| `ban_user` | Set ban status | Privileged | 🟠 High |
| `unban_user` | Remove ban status | Privileged | 🟠 High |
| `list_user_sessions` | Active sessions for user | Regular | 🟠 High |
| `revoke_user_sessions` | Sign out everywhere | Privileged | 🟠 High |
| `get_auth_settings` | MFA, email templates, providers | Regular | 🟡 Medium |
| `update_auth_settings` | Configure auth providers | Privileged | 🟡 Medium |
| `create_role` | Custom role creation | Privileged | 🟢 Low |
| `list_roles` | List custom roles | Regular | 🟢 Low |

---

## Phase 4: Vector / AI Operations (pgvector)

> **Goal**: Enable RAG and semantic search for AI applications.

| Tool | Description | Privilege | Priority |
|------|-------------|-----------|----------|
| `search_similar_vectors` | K-nearest neighbor search | Regular | 🔴 Critical |
| `insert_vector` | Insert embedding with metadata | Privileged | 🔴 Critical |
| `create_vector_index` | IVFFlat/HNSW with params | Privileged | 🔴 Critical |
| `drop_vector_index` | Safe removal | Privileged | 🟠 High |
| `get_vector_extension_status` | Version, installed status | Regular | 🟡 Medium |
| `optimize_vector_index` | Reindex recommendations | Privileged | 🟡 Medium |

**Parameters for `create_vector_index`**:
- `lists` (IVFFlat)
- `ef_construction`, `ef_search` (HNSW)
- `distance_metric`: cosine, l2, inner_product

---

## Phase 5: Edge Function Deployment

> **Goal**: Deploy, invoke, and manage serverless functions.

| Tool | Description | Privilege | Priority |
|------|-------------|-----------|----------|
| `deploy_edge_function` | Upload/Deploy function code | Privileged | 🟠 High |
| `update_edge_function` | Redeploy existing function | Privileged | 🟠 High |
| `delete_edge_function` | Remove deployment | Privileged | 🟠 High |
| `invoke_edge_function` | Call with payload | Regular | 🟠 High |
| `list_edge_function_secrets` | Environment variables | Regular | 🟡 Medium |
| `set_edge_function_secret` | Update env var | Privileged | 🟡 Medium |

---

## Phase 6: Realtime Management

> **Goal**: Setup and manage realtime subscriptions.

| Tool | Description | Privilege | Priority |
|------|-------------|-----------|----------|
| `create_publication` | For realtime replication | Privileged | 🟠 High |
| `alter_publication` | Add/remove tables | Privileged | 🟠 High |
| `drop_publication` | Remove publication | Privileged | 🟠 High |
| `list_realtime_channels` | Active subscriptions | Regular | 🟡 Medium |
| `get_realtime_config` | Connection limits | Regular | 🟡 Medium |

---

## Phase 7: Backup & Maintenance

> **Goal**: Disaster recovery and database health.

| Tool | Description | Privilege | Priority |
|------|-------------|-----------|----------|
| `create_backup` | pg_dump snapshot | Privileged | 🟠 High |
| `restore_backup` | pg_restore from backup | Privileged | 🟠 High |
| `list_backups` | Available backup files | Regular | 🟡 Medium |
| `vacuum_analyze` | Table maintenance | Privileged | 🟡 Medium |
| `reindex_table` | Rebuild corrupted indexes | Privileged | 🟡 Medium |
| `analyze_table` | Update statistics | Privileged | 🟡 Medium |
| `pg_terminate_backend` | Kill runaway queries | Privileged | 🟡 Medium |

---

## Phase 8: RLS Policy Management

> **Goal**: Programmatic security policy setup.

| Tool | Description | Privilege | Priority |
|------|-------------|-----------|----------|
| `create_rls_policy` | USING + WITH CHECK expressions | Privileged | 🟠 High |
| `delete_rls_policy` | Remove policy | Privileged | 🟠 High |
| `update_rls_policy` | Modify expressions | Privileged | 🟠 High |
| `enable_rls` | Toggle RLS on table | Privileged | 🟠 High |
| `disable_rls` | Toggle off | Privileged | 🟠 High |
| `force_rls` | Force RLS for table owners | Privileged | 🟡 Medium |

---

## Phase 9: Performance & Monitoring Deep Dive

| Tool | Description | Privilege | Priority |
|------|-------------|-----------|----------|
| `get_slow_queries` | pg_stat_statements top N | Regular | 🟡 Medium |
| `get_table_sizes` | Per-table disk usage | Regular | 🟡 Medium |
| `get_replication_lag` | Streaming replication status | Regular | 🟡 Medium |
| `get_locks` | Current lock waits | Regular | 🟡 Medium |
| `get_deadlocks` | Deadlock history | Regular | 🟡 Medium |
| `get_cache_hit_ratio` | Buffer cache effectiveness | Regular | 🟡 Medium |
| `get_autovacuum_status` | Table vacuum health | Regular | 🟡 Medium |
| `get_connection_pool_stats` | PgBouncer/Supavisor stats | Regular | 🟡 Medium |

---

## Phase 10: Batch Data Operations

| Tool | Description | Privilege | Priority |
|------|-------------|-----------|----------|
| `bulk_insert` | Insert array of rows | Privileged | 🟡 Medium |
| `bulk_update` | Update matching rows | Privileged | 🟡 Medium |
| `bulk_delete` | Delete with WHERE safety | Privileged | 🟡 Medium |
| `upsert` | INSERT ... ON CONFLICT | Privileged | 🟡 Medium |
| `batch_execute_sql` | Multiple statements in one call | Privileged | 🟡 Medium |
| `import_csv` | Import from CSV content | Privileged | 🟡 Medium |
| `export_table` | Export table to CSV/JSON | Regular | 🟡 Medium |

---

## Phase 11: Final Polish — Role Management & CDC

> **Note**: MCP 2026 features (Apps, Async Tasks, Sampling, Elicitation) are protocol-level capabilities, not server tools. They will be adopted as the SDK evolves.

| Tool | Description | Privilege | Priority |
|------|-------------|-----------|----------|
| `delete_role` | Drop PostgreSQL role with reassignment | Privileged | 🟢 Low |
| `get_replication_slots` | List logical replication slots for CDC | Regular | 🟢 Low |

---

## Phase 12: Out of Scope for Self-Hosted

The following features are **excluded** because they target Supabase Platform (cloud) and are not available/applicable to self-hosted instances:

| Feature | Reason |
|---------|--------|
| Multi-project support | Self-hosted = single instance |
| Vault secrets (pgsodium) | Requires Platform-tier extensions |
| MFA settings | Configured via `GOTRUE_*` env vars, not DB |
| OAuth provider config | Configured via `GOTRUE_EXTERNAL_*` env vars |
| MCP Apps / Async Tasks / Sampling / Elicitation | Protocol-level, adopted with SDK updates |

---

## Testing Strategy

### Unit Tests
- Every new tool gets unit tests with mock client
- RBAC tests for privilege levels
- Input validation tests (Zod schemas)

### Integration Tests
- Run against real Supabase instance (`data.mobiline.cloud`)
- Docker Compose stack testing
- HTTP transport end-to-end tests

### Security Tests
- SQL injection attempts
- Privilege escalation attempts
- JWT tampering tests

---

## Timeline Estimate

| Phase | Tools | Estimated Time |
|-------|-------|---------------|
| Phase 1: DDL | 12 | 2-3 weeks |
| Phase 2: Storage | 10 | 1-2 weeks |
| Phase 3: Auth Bulk | 14 | 2 weeks |
| Phase 4: Vector | 6 | 1 week |
| Phase 5: Edge Functions | 6 | 1 week |
| Phase 6: Realtime | 5 | 3-4 days |
| Phase 7: Backup | 7 | 1 week |
| Phase 8: RLS | 6 | 3-4 days |
| Phase 9: Monitoring | 8 | 1 week |
| Phase 10: Batch Ops | 7 | 1 week |
| Phase 11: Final Polish | 2 | 2-3 days |
| Phase 12: — | — | — |

**Total: 83 new tools, ~2.5 months full-time**

---

## Architectural Decisions

1. **Stay on SDK v1.29.0** for stability, plan v2 migration for Q3 2026
2. **Use `defineTool` helper** for all new tools (auto JSON Schema)
3. **Parameterized queries everywhere** — no string interpolation for identifiers
4. **Dry-run mode** for DDL tools (preview before execute)
5. **Progress notifications** for long-running operations
6. **Audit logging** for all privileged operations

---

## Success Criteria

- [x] 126 tools total (43 original + 83 new)
- [x] 400+ tests
- [x] 100% coverage for critical tools (DDL, Auth, Storage)
- [ ] Works with both self-hosted and cloud Supabase
- [ ] Zero SQL injection vulnerabilities
- [ ] CI/CD passing on every PR
