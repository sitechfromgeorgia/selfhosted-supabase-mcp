import { Command } from 'commander';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ErrorCode,
    ListToolsRequestSchema,
    McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { SelfhostedSupabaseClient } from './client/index.js';
import { HttpMcpServer } from './server/http-server.js';
import { listTablesTool } from './tools/list_tables.js';
import { listExtensionsTool } from './tools/list_extensions.js';
import { listMigrationsTool } from './tools/list_migrations.js';
import { applyMigrationTool } from './tools/apply_migration.js';
import { executeSqlTool } from './tools/execute_sql.js';
import { getDatabaseConnectionsTool } from './tools/get_database_connections.js';
import { getDatabaseStatsTool } from './tools/get_database_stats.js';
import { getProjectUrlTool } from './tools/get_project_url.js';
import { generateTypesTool } from './tools/generate_typescript_types.js';
import { rebuildHooksTool } from './tools/rebuild_hooks.js';
import { verifyJwtSecretTool } from './tools/verify_jwt_secret.js';
import { listAuthUsersTool } from './tools/list_auth_users.js';
import { getAuthUserTool } from './tools/get_auth_user.js';
import { deleteAuthUserTool } from './tools/delete_auth_user.js';
import { createAuthUserTool } from './tools/create_auth_user.js';
import { updateAuthUserTool } from './tools/update_auth_user.js';
import { z } from 'zod';
import { canAccessTool, type ToolContext, type ToolPrivilegeLevel, type UserContext } from './tools/types.js';
import type { AppTool } from './tools/define-tool.js';
import listStorageBucketsTool from './tools/list_storage_buckets.js';
import listStorageObjectsTool from './tools/list_storage_objects.js';
import listRealtimePublicationsTool from './tools/list_realtime_publications.js';
import { listCronJobsTool } from './tools/list_cron_jobs.js';
import { listVectorIndexesTool } from './tools/list_vector_indexes.js';
import { listEdgeFunctionsTool } from './tools/list_edge_functions.js';
import { getEdgeFunctionDetailsTool } from './tools/get_edge_function_details.js';
import { getLogsTool } from './tools/get_logs.js';
import { getAdvisorsTool } from './tools/get_advisors.js';
import { getStorageConfigTool } from './tools/get_storage_config.js';
import { updateStorageConfigTool } from './tools/update_storage_config.js';
import { listTableColumnsTool } from './tools/list_table_columns.js';
import { listIndexesTool } from './tools/list_indexes.js';
import { listConstraintsTool } from './tools/list_constraints.js';
import { listForeignKeysTool } from './tools/list_foreign_keys.js';
import { listRlsPoliciesTool } from './tools/list_rls_policies.js';
import { listTriggersTool } from './tools/list_triggers.js';
import { listDatabaseFunctionsTool } from './tools/list_database_functions.js';
import { getFunctionDefinitionTool } from './tools/get_function_definition.js';
import { getTriggerDefinitionTool } from './tools/get_trigger_definition.js';
import { getRlsStatusTool } from './tools/get_rls_status.js';
import { listAvailableExtensionsTool } from './tools/list_available_extensions.js';
import { getCronJobHistoryTool } from './tools/get_cron_job_history.js';
import { listEdgeFunctionLogsTool } from './tools/list_edge_function_logs.js';
import { getIndexStatsTool } from './tools/get_index_stats.js';
import { getVectorIndexStatsTool } from './tools/get_vector_index_stats.js';
import { explainQueryTool } from './tools/explain_query.js';
import { createTableTool } from './tools/create_table.js';
import { alterTableTool } from './tools/alter_table.js';
import { dropTableTool } from './tools/drop_table.js';
import { createIndexTool } from './tools/create_index.js';
import { dropIndexTool } from './tools/drop_index.js';
import { addForeignKeyTool } from './tools/add_foreign_key.js';
import { dropForeignKeyTool } from './tools/drop_foreign_key.js';
import { renameTableTool } from './tools/rename_table.js';
import { createSchemaTool } from './tools/create_schema.js';
import { dropSchemaTool } from './tools/drop_schema.js';
import { createSequenceTool } from './tools/create_sequence.js';
import { setColumnDefaultTool } from './tools/set_column_default.js';
import { createStorageBucketTool } from './tools/create_storage_bucket.js';
import { deleteStorageBucketTool } from './tools/delete_storage_bucket.js';
import { uploadFileTool } from './tools/upload_file.js';
import { downloadFileTool } from './tools/download_file.js';
import { deleteStorageObjectTool } from './tools/delete_storage_object.js';
import { moveStorageObjectTool } from './tools/move_storage_object.js';
import { copyStorageObjectTool } from './tools/copy_storage_object.js';
import { getStorageObjectMetadataTool } from './tools/get_storage_object_metadata.js';
import { createSignedUrlTool } from './tools/create_signed_url.js';
import { emptyStorageBucketTool } from './tools/empty_storage_bucket.js';
import { bulkCreateAuthUsersTool } from './tools/bulk_create_auth_users.js';
import { bulkDeleteAuthUsersTool } from './tools/bulk_delete_auth_users.js';
import { bulkUpdateAuthUsersTool } from './tools/bulk_update_auth_users.js';
import { sendPasswordResetTool } from './tools/send_password_reset.js';
import { inviteUserTool } from './tools/invite_user.js';
import { confirmUserEmailTool } from './tools/confirm_user_email.js';
import { banUserTool } from './tools/ban_user.js';
import { unbanUserTool } from './tools/unban_user.js';
import { listUserSessionsTool } from './tools/list_user_sessions.js';
import { revokeUserSessionsTool } from './tools/revoke_user_sessions.js';
import { getAuthSettingsTool } from './tools/get_auth_settings.js';
import { updateAuthSettingsTool } from './tools/update_auth_settings.js';
import { createRoleTool } from './tools/create_role.js';
import { listRolesTool } from './tools/list_roles.js';
import { searchSimilarVectorsTool } from './tools/search_similar_vectors.js';
import { insertVectorTool } from './tools/insert_vector.js';
import { createVectorIndexTool } from './tools/create_vector_index.js';
import { dropVectorIndexTool } from './tools/drop_vector_index.js';
import { getVectorExtensionStatusTool } from './tools/get_vector_extension_status.js';
import { optimizeVectorIndexTool } from './tools/optimize_vector_index.js';
import { deployEdgeFunctionTool } from './tools/deploy_edge_function.js';
import { updateEdgeFunctionTool } from './tools/update_edge_function.js';
import { deleteEdgeFunctionTool } from './tools/delete_edge_function.js';
import { invokeEdgeFunctionTool } from './tools/invoke_edge_function.js';
import { listEdgeFunctionSecretsTool } from './tools/list_edge_function_secrets.js';
import { setEdgeFunctionSecretTool } from './tools/set_edge_function_secret.js';
import { createPublicationTool } from './tools/create_publication.js';
import { alterPublicationTool } from './tools/alter_publication.js';
import { dropPublicationTool } from './tools/drop_publication.js';
import { listRealtimeChannelsTool } from './tools/list_realtime_channels.js';
import { getRealtimeConfigTool } from './tools/get_realtime_config.js';
import { createBackupTool } from './tools/create_backup.js';
import { restoreBackupTool } from './tools/restore_backup.js';
import { listBackupsTool } from './tools/list_backups.js';
import { vacuumAnalyzeTool } from './tools/vacuum_analyze.js';
import { reindexTableTool } from './tools/reindex_table.js';
import { analyzeTableTool } from './tools/analyze_table.js';
import { pgTerminateBackendTool } from './tools/pg_terminate_backend.js';
import { createRlsPolicyTool } from './tools/create_rls_policy.js';
import { deleteRlsPolicyTool } from './tools/delete_rls_policy.js';
import { updateRlsPolicyTool } from './tools/update_rls_policy.js';
import { enableRlsTool } from './tools/enable_rls.js';
import { disableRlsTool } from './tools/disable_rls.js';
import { forceRlsTool } from './tools/force_rls.js';
import { getSlowQueriesTool } from './tools/get_slow_queries.js';
import { getTableSizesTool } from './tools/get_table_sizes.js';
import { getReplicationLagTool } from './tools/get_replication_lag.js';
import { getLocksTool } from './tools/get_locks.js';
import { getDeadlocksTool } from './tools/get_deadlocks.js';
import { getCacheHitRatioTool } from './tools/get_cache_hit_ratio.js';
import { getAutovacuumStatusTool } from './tools/get_autovacuum_status.js';
import { getConnectionPoolStatsTool } from './tools/get_connection_pool_stats.js';
import { bulkInsertTool } from './tools/bulk_insert.js';
import { bulkUpdateTool } from './tools/bulk_update.js';
import { bulkDeleteTool } from './tools/bulk_delete.js';
import { upsertTool } from './tools/upsert.js';
import { batchExecuteSqlTool } from './tools/batch_execute_sql.js';
import { importCsvTool } from './tools/import_csv.js';
import { exportTableTool } from './tools/export_table.js';
import { deleteRoleTool } from './tools/delete_role.js';
import { getReplicationSlotsTool } from './tools/get_replication_slots.js';
import { registerResourceHandlers } from './resources/index.js';
import { registerPromptHandlers } from './prompts/index.js';

// Node.js built-in modules
import * as fs from 'node:fs';
import * as path from 'node:path';

// Define the structure expected by MCP for tool definitions
interface McpToolSchema {
    name: string;
    description?: string;
    // inputSchema is the JSON Schema object for MCP capabilities
    inputSchema: object; 
}

// Main function
async function main() {
    const program = new Command();

    program
        .name('self-hosted-supabase-mcp')
        .description('MCP Server for self-hosted Supabase instances')
        .option('--url <url>', 'Supabase project URL', process.env.SUPABASE_URL)
        .option('--anon-key <key>', 'Supabase anonymous key', process.env.SUPABASE_ANON_KEY)
        .option('--service-key <key>', 'Supabase service role key (optional)', process.env.SUPABASE_SERVICE_ROLE_KEY)
        .option('--db-url <url>', 'Direct database connection string (optional, for pg fallback)', process.env.DATABASE_URL)
        .option('--jwt-secret <secret>', 'Supabase JWT secret (optional, needed for some tools)', process.env.SUPABASE_AUTH_JWT_SECRET)
        .option('--workspace-path <path>', 'Workspace root path (for file operations)', process.cwd())
        .option('--tools-config <path>', 'Path to a JSON file specifying which tools to enable (e.g., { "enabledTools": ["tool1", "tool2"] }). If omitted, all tools are enabled.')
        .option('--transport <type>', 'Transport mode: stdio or http (default: stdio)', 'stdio')
        .option('--port <number>', 'HTTP server port (default: 3000)', '3000')
        .option('--host <string>', 'HTTP server host (default: 127.0.0.1)', '127.0.0.1')
        .option('--cors-origins <origins>', 'Comma-separated list of allowed CORS origins (default: localhost only)')
        .option('--rate-limit-window <ms>', 'Rate limit window in milliseconds (default: 60000)', '60000')
        .option('--rate-limit-max <count>', 'Max requests per rate limit window (default: 100)', '100')
        .option('--request-timeout <ms>', 'Request timeout in milliseconds (default: 30000)', '30000')
        .parse(process.argv);

    const options = program.opts();

    if (!options.url) {
        console.error('Error: Supabase URL is required. Use --url or SUPABASE_URL.');
        throw new Error('Supabase URL is required.');
    }
    if (!options.anonKey) {
        console.error('Error: Supabase Anon Key is required. Use --anon-key or SUPABASE_ANON_KEY.');
        throw new Error('Supabase Anon Key is required.');
    }

    // Validate transport option
    const transport = options.transport as string;
    if (transport !== 'stdio' && transport !== 'http') {
        console.error('Error: Invalid transport. Must be "stdio" or "http".');
        throw new Error('Invalid transport mode.');
    }

    // HTTP mode requires JWT secret for authentication
    if (transport === 'http' && !options.jwtSecret) {
        console.error('Error: --jwt-secret is required for HTTP transport mode.');
        throw new Error('JWT secret is required for HTTP mode.');
    }

    console.error(`Initializing Self-Hosted Supabase MCP Server (transport: ${transport})...`);

    try {
        const selfhostedClient = await SelfhostedSupabaseClient.create({
            supabaseUrl: options.url,
            supabaseAnonKey: options.anonKey,
            supabaseServiceRoleKey: options.serviceKey,
            databaseUrl: options.dbUrl,
            jwtSecret: options.jwtSecret,
        });

        console.error('Supabase client initialized successfully.');

        // Use Map for tool registration to avoid object injection patterns
        const availableTools = new Map<string, AppTool>([
            [listTablesTool.name, listTablesTool as AppTool],
            [listExtensionsTool.name, listExtensionsTool as AppTool],
            [listMigrationsTool.name, listMigrationsTool as AppTool],
            [applyMigrationTool.name, applyMigrationTool as AppTool],
            [executeSqlTool.name, executeSqlTool as AppTool],
            [getDatabaseConnectionsTool.name, getDatabaseConnectionsTool as AppTool],
            [getDatabaseStatsTool.name, getDatabaseStatsTool as AppTool],
            [getProjectUrlTool.name, getProjectUrlTool as AppTool],
            [generateTypesTool.name, generateTypesTool as AppTool],
            [rebuildHooksTool.name, rebuildHooksTool as AppTool],
            [verifyJwtSecretTool.name, verifyJwtSecretTool as AppTool],
            [listAuthUsersTool.name, listAuthUsersTool as AppTool],
            [getAuthUserTool.name, getAuthUserTool as AppTool],
            [deleteAuthUserTool.name, deleteAuthUserTool as AppTool],
            [createAuthUserTool.name, createAuthUserTool as AppTool],
            [updateAuthUserTool.name, updateAuthUserTool as AppTool],
            [listStorageBucketsTool.name, listStorageBucketsTool as AppTool],
            [listStorageObjectsTool.name, listStorageObjectsTool as AppTool],
            [listRealtimePublicationsTool.name, listRealtimePublicationsTool as AppTool],
            [listCronJobsTool.name, listCronJobsTool as AppTool],
            [listVectorIndexesTool.name, listVectorIndexesTool as AppTool],
            [listEdgeFunctionsTool.name, listEdgeFunctionsTool as AppTool],
            [getEdgeFunctionDetailsTool.name, getEdgeFunctionDetailsTool as AppTool],
            [getLogsTool.name, getLogsTool as AppTool],
            [getAdvisorsTool.name, getAdvisorsTool as AppTool],
            [getStorageConfigTool.name, getStorageConfigTool as AppTool],
            [updateStorageConfigTool.name, updateStorageConfigTool as AppTool],
            [listTableColumnsTool.name, listTableColumnsTool as AppTool],
            [listIndexesTool.name, listIndexesTool as AppTool],
            [listConstraintsTool.name, listConstraintsTool as AppTool],
            [listForeignKeysTool.name, listForeignKeysTool as AppTool],
            [listRlsPoliciesTool.name, listRlsPoliciesTool as AppTool],
            [listTriggersTool.name, listTriggersTool as AppTool],
            [listDatabaseFunctionsTool.name, listDatabaseFunctionsTool as AppTool],
            [getFunctionDefinitionTool.name, getFunctionDefinitionTool as AppTool],
            [getTriggerDefinitionTool.name, getTriggerDefinitionTool as AppTool],
            [getRlsStatusTool.name, getRlsStatusTool as AppTool],
            [listAvailableExtensionsTool.name, listAvailableExtensionsTool as AppTool],
            [getCronJobHistoryTool.name, getCronJobHistoryTool as AppTool],
            [listEdgeFunctionLogsTool.name, listEdgeFunctionLogsTool as AppTool],
            [getIndexStatsTool.name, getIndexStatsTool as AppTool],
            [getVectorIndexStatsTool.name, getVectorIndexStatsTool as AppTool],
            [explainQueryTool.name, explainQueryTool as AppTool],
            [createTableTool.name, createTableTool as AppTool],
            [alterTableTool.name, alterTableTool as AppTool],
            [dropTableTool.name, dropTableTool as AppTool],
            [createIndexTool.name, createIndexTool as AppTool],
            [dropIndexTool.name, dropIndexTool as AppTool],
            [addForeignKeyTool.name, addForeignKeyTool as AppTool],
            [dropForeignKeyTool.name, dropForeignKeyTool as AppTool],
            [renameTableTool.name, renameTableTool as AppTool],
            [createSchemaTool.name, createSchemaTool as AppTool],
            [dropSchemaTool.name, dropSchemaTool as AppTool],
            [createSequenceTool.name, createSequenceTool as AppTool],
            [setColumnDefaultTool.name, setColumnDefaultTool as AppTool],
            [createStorageBucketTool.name, createStorageBucketTool as AppTool],
            [deleteStorageBucketTool.name, deleteStorageBucketTool as AppTool],
            [uploadFileTool.name, uploadFileTool as AppTool],
            [downloadFileTool.name, downloadFileTool as AppTool],
            [deleteStorageObjectTool.name, deleteStorageObjectTool as AppTool],
            [moveStorageObjectTool.name, moveStorageObjectTool as AppTool],
            [copyStorageObjectTool.name, copyStorageObjectTool as AppTool],
            [getStorageObjectMetadataTool.name, getStorageObjectMetadataTool as AppTool],
            [createSignedUrlTool.name, createSignedUrlTool as AppTool],
            [emptyStorageBucketTool.name, emptyStorageBucketTool as AppTool],
            [bulkCreateAuthUsersTool.name, bulkCreateAuthUsersTool as AppTool],
            [bulkDeleteAuthUsersTool.name, bulkDeleteAuthUsersTool as AppTool],
            [bulkUpdateAuthUsersTool.name, bulkUpdateAuthUsersTool as AppTool],
            [sendPasswordResetTool.name, sendPasswordResetTool as AppTool],
            [inviteUserTool.name, inviteUserTool as AppTool],
            [confirmUserEmailTool.name, confirmUserEmailTool as AppTool],
            [banUserTool.name, banUserTool as AppTool],
            [unbanUserTool.name, unbanUserTool as AppTool],
            [listUserSessionsTool.name, listUserSessionsTool as AppTool],
            [revokeUserSessionsTool.name, revokeUserSessionsTool as AppTool],
            [getAuthSettingsTool.name, getAuthSettingsTool as AppTool],
            [updateAuthSettingsTool.name, updateAuthSettingsTool as AppTool],
            [createRoleTool.name, createRoleTool as AppTool],
            [listRolesTool.name, listRolesTool as AppTool],
            [searchSimilarVectorsTool.name, searchSimilarVectorsTool as AppTool],
            [insertVectorTool.name, insertVectorTool as AppTool],
            [createVectorIndexTool.name, createVectorIndexTool as AppTool],
            [dropVectorIndexTool.name, dropVectorIndexTool as AppTool],
            [getVectorExtensionStatusTool.name, getVectorExtensionStatusTool as AppTool],
            [optimizeVectorIndexTool.name, optimizeVectorIndexTool as AppTool],
            [deployEdgeFunctionTool.name, deployEdgeFunctionTool as AppTool],
            [updateEdgeFunctionTool.name, updateEdgeFunctionTool as AppTool],
            [deleteEdgeFunctionTool.name, deleteEdgeFunctionTool as AppTool],
            [invokeEdgeFunctionTool.name, invokeEdgeFunctionTool as AppTool],
            [listEdgeFunctionSecretsTool.name, listEdgeFunctionSecretsTool as AppTool],
            [setEdgeFunctionSecretTool.name, setEdgeFunctionSecretTool as AppTool],
            [createPublicationTool.name, createPublicationTool as AppTool],
            [alterPublicationTool.name, alterPublicationTool as AppTool],
            [dropPublicationTool.name, dropPublicationTool as AppTool],
            [listRealtimeChannelsTool.name, listRealtimeChannelsTool as AppTool],
            [getRealtimeConfigTool.name, getRealtimeConfigTool as AppTool],
            [createBackupTool.name, createBackupTool as AppTool],
            [restoreBackupTool.name, restoreBackupTool as AppTool],
            [listBackupsTool.name, listBackupsTool as AppTool],
            [vacuumAnalyzeTool.name, vacuumAnalyzeTool as AppTool],
            [reindexTableTool.name, reindexTableTool as AppTool],
            [analyzeTableTool.name, analyzeTableTool as AppTool],
            [pgTerminateBackendTool.name, pgTerminateBackendTool as AppTool],
            [createRlsPolicyTool.name, createRlsPolicyTool as AppTool],
            [deleteRlsPolicyTool.name, deleteRlsPolicyTool as AppTool],
            [updateRlsPolicyTool.name, updateRlsPolicyTool as AppTool],
            [enableRlsTool.name, enableRlsTool as AppTool],
            [disableRlsTool.name, disableRlsTool as AppTool],
            [forceRlsTool.name, forceRlsTool as AppTool],
            [getSlowQueriesTool.name, getSlowQueriesTool as AppTool],
            [getTableSizesTool.name, getTableSizesTool as AppTool],
            [getReplicationLagTool.name, getReplicationLagTool as AppTool],
            [getLocksTool.name, getLocksTool as AppTool],
            [getDeadlocksTool.name, getDeadlocksTool as AppTool],
            [getCacheHitRatioTool.name, getCacheHitRatioTool as AppTool],
            [getAutovacuumStatusTool.name, getAutovacuumStatusTool as AppTool],
            [getConnectionPoolStatsTool.name, getConnectionPoolStatsTool as AppTool],
            [bulkInsertTool.name, bulkInsertTool as AppTool],
            [bulkUpdateTool.name, bulkUpdateTool as AppTool],
            [bulkDeleteTool.name, bulkDeleteTool as AppTool],
            [upsertTool.name, upsertTool as AppTool],
            [batchExecuteSqlTool.name, batchExecuteSqlTool as AppTool],
            [importCsvTool.name, importCsvTool as AppTool],
            [exportTableTool.name, exportTableTool as AppTool],
            [deleteRoleTool.name, deleteRoleTool as AppTool],
            [getReplicationSlotsTool.name, getReplicationSlotsTool as AppTool],
        ]);

        // --- Tool Filtering Logic ---
        // Use Map for registered tools (copy from available tools initially)
        let registeredTools = new Map<string, AppTool>(availableTools);
        const toolsConfigPath = options.toolsConfig as string | undefined;
        let enabledToolNames: Set<string> | null = null; // Use Set for efficient lookup

        if (toolsConfigPath) {
            try {
                const resolvedPath = path.resolve(toolsConfigPath);
                console.error(`Attempting to load tool configuration from: ${resolvedPath}`);
                if (!fs.existsSync(resolvedPath)) {
                    throw new Error(`Tool configuration file not found at ${resolvedPath}`);
                }
                const configFileContent = fs.readFileSync(resolvedPath, 'utf-8');
                const configJson = JSON.parse(configFileContent);

                if (!configJson || typeof configJson !== 'object' || !Array.isArray(configJson.enabledTools)) {
                     throw new Error('Invalid config file format. Expected { "enabledTools": ["tool1", ...] }.');
                }

                // Validate that enabledTools contains only strings
                const toolNames = configJson.enabledTools as unknown[];
                if (!toolNames.every((name): name is string => typeof name === 'string')) {
                    throw new Error('Invalid config file content. "enabledTools" must be an array of strings.');
                }

                enabledToolNames = new Set(toolNames.map(name => name.trim()).filter(name => name.length > 0));

            } catch (error: unknown) {
                console.error(`Error loading or parsing tool config file '${toolsConfigPath}':`, error instanceof Error ? error.message : String(error));
                console.error('Falling back to enabling all tools due to config error.');
                enabledToolNames = null; // Reset to null to signify fallback
            }
        }

        if (enabledToolNames !== null) { // Check if we successfully got names from config
            console.error(`Whitelisting tools based on config: ${Array.from(enabledToolNames).join(', ')}`);

            // Create new Map with only whitelisted tools
            registeredTools = new Map<string, AppTool>();
            for (const [toolName, tool] of availableTools) {
                if (enabledToolNames.has(toolName)) {
                    registeredTools.set(toolName, tool);
                } else {
                    console.error(`Tool ${toolName} disabled (not in config whitelist).`);
                }
            }

            // Check if any tools specified in the config were not found in availableTools
            // Map.has() is safe from prototype pollution
            for (const requestedName of enabledToolNames) {
                if (!availableTools.has(requestedName)) {
                    console.warn(`Warning: Tool "${requestedName}" specified in config file not found.`);
                }
            }
        } else {
            console.error("No valid --tools-config specified or error loading config, enabling all available tools.");
            // registeredTools already defaults to all tools, so no action needed here
        }
        // --- End Tool Filtering Logic ---

        // Prepare capabilities for the Server constructor
        const capabilitiesTools: Record<string, McpToolSchema> = {};
        // Use the potentially filtered 'registeredTools' map (using Map.values())
        for (const tool of registeredTools.values()) {
            capabilitiesTools[tool.name] = {
                name: tool.name,
                description: tool.description || 'Tool description missing',
                inputSchema: tool.mcpInputSchema,
            };
        }

        const capabilities = {
            tools: capabilitiesTools,
            resources: { listChanged: true },
            prompts: { listChanged: true },
        };

        // Factory function to create a configured MCP server instance
        // This is needed for HTTP mode where each request may need a fresh server
        // In HTTP mode, userContext is provided for privilege-level enforcement
        const createMcpServer = (userContext?: UserContext): Server => {
            const server = new Server(
                {
                    name: 'self-hosted-supabase-mcp',
                    version: '1.3.0',
                },
                {
                    capabilities,
                },
            );

            // The ListTools handler should return the array matching McpToolSchema structure
            server.setRequestHandler(ListToolsRequestSchema, async () => ({
                tools: Object.values(capabilities.tools),
            }));

            // Register resource and prompt handlers
            registerResourceHandlers(server, selfhostedClient);
            registerPromptHandlers(server);

            server.setRequestHandler(CallToolRequestSchema, async (request) => {
                const toolName = request.params.name;

                // Look up the tool in the filtered 'registeredTools' Map
                // Map.has() and Map.get() are safe from prototype pollution
                const tool = registeredTools.get(toolName);
                if (!tool) {
                    // Check if it existed originally but was filtered out
                    if (availableTools.has(toolName)) {
                        throw new McpError(ErrorCode.MethodNotFound, `Tool "${toolName}" is available but not enabled by the current server configuration.`);
                    }
                    // If the tool wasn't in the original list either, it's unknown
                    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
                }

                // SECURITY: Check privilege level in HTTP mode
                // In stdio mode (no userContext), all tools are accessible (trusted local process)
                if (userContext) {
                    const toolPrivilegeLevel = tool.privilegeLevel ?? 'regular';
                    if (!canAccessTool(userContext.role, toolPrivilegeLevel)) {
                        console.error(`[SECURITY] Access denied: User ${userContext.email || userContext.userId} (role: ${userContext.role}) attempted to access ${toolName} (requires: ${toolPrivilegeLevel})`);
                        throw new McpError(
                            ErrorCode.InvalidRequest,
                            `Access denied: Tool '${toolName}' requires '${toolPrivilegeLevel}' privilege. ` +
                            `Your role '${userContext.role}' does not have sufficient permissions.`
                        );
                    }
                }

                try {
                    if (typeof tool.execute !== 'function') {
                        throw new Error(`Tool ${toolName} does not have an execute method.`);
                    }

                    // Validate and parse arguments using Zod schema
                    const parsedArgs = (tool.inputSchema as z.ZodTypeAny).parse(
                        request.params.arguments
                    ) as Record<string, unknown>;

                    // Create the context object using the imported type
                    const context: ToolContext = {
                        selfhostedClient,
                        workspacePath: options.workspacePath as string,
                        user: userContext, // Pass user context for audit logging
                        log: (message, level = 'info') => {
                            // Simple logger using console.error (consistent with existing logs)
                            console.error(`[${level.toUpperCase()}] ${message}`);
                        }
                    };

                    // Call the tool's execute method with validated arguments
                    const result = await tool.execute(parsedArgs, context);

                    return {
                        content: [
                            {
                                type: 'text',
                                text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
                            },
                        ],
                    };
                } catch (error: unknown) {
                     console.error(`Error executing tool ${toolName}:`, error);
                     let errorMessage = `Error executing tool ${toolName}: `;
                     if (error instanceof z.ZodError) {
                         errorMessage += `Input validation failed: ${error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`;
                     } else if (error instanceof Error) {
                         errorMessage += error.message;
                     } else {
                         errorMessage += String(error);
                     }
                     return {
                        content: [{ type: 'text', text: errorMessage }],
                        isError: true,
                     };
                }
            });

            return server;
        };

        // Start the appropriate transport
        if (transport === 'http') {
            console.error('Starting MCP Server in HTTP mode...');

            // Parse CORS origins if provided
            const corsOrigins = options.corsOrigins
                ? (options.corsOrigins as string).split(',').map(o => o.trim()).filter(o => o.length > 0)
                : undefined;

            const httpServer = new HttpMcpServer(
                {
                    port: parseInt(options.port as string, 10),
                    host: options.host as string,
                    jwtSecret: options.jwtSecret as string,
                    corsOrigins,
                    rateLimitWindowMs: parseInt(options.rateLimitWindow as string, 10),
                    rateLimitMaxRequests: parseInt(options.rateLimitMax as string, 10),
                    requestTimeoutMs: parseInt(options.requestTimeout as string, 10),
                },
                createMcpServer
            );

            await httpServer.start();

            // Handle graceful shutdown
            // Use void to properly handle async handlers in process.on callbacks
            process.on('SIGINT', () => {
                void (async () => {
                    console.error('Shutting down...');
                    await httpServer.stop();
                    await selfhostedClient.close();
                    process.exit(0);
                })();
            });

            process.on('SIGTERM', () => {
                void (async () => {
                    console.error('Shutting down...');
                    await httpServer.stop();
                    await selfhostedClient.close();
                    process.exit(0);
                })();
            });
        } else {
            // WARNING: Stdio mode has NO authentication - all tools accessible
            console.error('Starting MCP Server in stdio mode...');
            console.error('');
            console.error('================================================================================');
            console.error('WARNING: Stdio mode has NO authentication. All tools (including privileged');
            console.error('         tools) are accessible. Only use stdio mode with trusted local clients.');
            console.error('         For remote access, use HTTP mode with JWT authentication.');
            console.error('================================================================================');
            console.error('');
            const server = createMcpServer();
            const stdioTransport = new StdioServerTransport();
            await server.connect(stdioTransport);
            console.error('MCP Server connected to stdio.');

            // Handle graceful shutdown in stdio mode
            process.on('SIGINT', () => {
                void (async () => {
                    console.error('Shutting down stdio server...');
                    await server.close();
                    await selfhostedClient.close();
                    process.exit(0);
                })();
            });

            process.on('SIGTERM', () => {
                void (async () => {
                    console.error('Shutting down stdio server...');
                    await server.close();
                    await selfhostedClient.close();
                    process.exit(0);
                })();
            });
        }

    } catch (error) {
        console.error('Failed to initialize or start the MCP server:', error);
        throw error; // Rethrow to ensure the process exits non-zero if init fails
    }
}

main().catch((error) => {
    console.error('Unhandled error in main function:', error);
    process.exit(1); // Exit with error code
});