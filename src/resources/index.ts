/**
 * MCP Resources implementation for self-hosted Supabase MCP Server.
 *
 * Resources provide schema introspection data that MCP clients can
 * "read" directly without invoking tools.
 */

import {
    ListResourcesRequestSchema,
    ListResourceTemplatesRequestSchema,
    ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { SelfhostedSupabaseClient } from '../client/index.js';
import { executeSqlWithFallback } from '../tools/utils.js';

// Resource URI schemes
const RESOURCE_SCHEMES = {
    TABLE: 'database://schema',
    FUNCTION: 'database://function',
    RLS: 'database://rls',
} as const;

/**
 * Registers resource handlers on an MCP server instance.
 */
export function registerResourceHandlers(
    server: Server,
    client: SelfhostedSupabaseClient
): void {
    // List available static resources (tables from public schema as a sample)
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
        const tablesResult = await executeSqlWithFallback(
            client,
            `SELECT table_schema, table_name
             FROM information_schema.tables
             WHERE table_schema = 'public'
             ORDER BY table_name
             LIMIT 20`,
            true
        );

        const tables = Array.isArray(tablesResult) ? tablesResult : [];

        return {
            resources: tables.map((row) => ({
                uri: `${RESOURCE_SCHEMES.TABLE}/${row.table_schema}/tables/${row.table_name}`,
                name: `Table: ${row.table_schema}.${row.table_name}`,
                mimeType: 'application/json',
                description: `Schema and columns for ${row.table_schema}.${row.table_name}`,
            })),
        };
    });

    // List resource templates for dynamic resources
    server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
        return {
            resourceTemplates: [
                {
                    uriTemplate: `${RESOURCE_SCHEMES.TABLE}/{schema}/tables/{table}`,
                    name: 'Database Table Schema',
                    mimeType: 'application/json',
                    description: 'Column definitions, types, and defaults for a database table',
                },
                {
                    uriTemplate: `${RESOURCE_SCHEMES.FUNCTION}/{name}`,
                    name: 'Database Function Definition',
                    mimeType: 'application/json',
                    description: 'Source definition of a PostgreSQL function',
                },
                {
                    uriTemplate: `${RESOURCE_SCHEMES.RLS}/{schema}/{table}`,
                    name: 'RLS Policies',
                    mimeType: 'application/json',
                    description: 'Row-Level Security policies for a table',
                },
            ],
        };
    });

    // Read a specific resource by URI
    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
        const uri = request.params.uri;

        // Table schema resource
        if (uri.startsWith(RESOURCE_SCHEMES.TABLE)) {
            const match = uri.match(
                new RegExp(`^${RESOURCE_SCHEMES.TABLE}/([^/]+)/tables/(.+)$`)
            );
            if (match) {
                const [, schema, table] = match;
                const result = await executeSqlWithFallback(
                    client,
                    `SELECT column_name, data_type, is_nullable, column_default
                     FROM information_schema.columns
                     WHERE table_schema = '${schema}' AND table_name = '${table}'
                     ORDER BY ordinal_position`,
                    true
                );

                if (!Array.isArray(result)) {
                    throw new Error(`Failed to read table schema: ${result.error?.message ?? 'Unknown error'}`);
                }

                return {
                    contents: [
                        {
                            uri,
                            mimeType: 'application/json',
                            text: JSON.stringify(
                                {
                                    schema,
                                    table,
                                    columns: result,
                                },
                                null,
                                2
                            ),
                        },
                    ],
                };
            }
        }

        // Function definition resource
        if (uri.startsWith(RESOURCE_SCHEMES.FUNCTION)) {
            const match = uri.match(new RegExp(`^${RESOURCE_SCHEMES.FUNCTION}/(.+)$`));
            if (match) {
                const [, functionName] = match;
                const result = await executeSqlWithFallback(
                    client,
                    `SELECT proname AS name, pg_get_functiondef(oid) AS definition
                     FROM pg_proc
                     WHERE proname = '${functionName}'
                     LIMIT 1`,
                    true
                );

                if (!Array.isArray(result) || result.length === 0) {
                    throw new Error(`Function not found: ${functionName}`);
                }

                return {
                    contents: [
                        {
                            uri,
                            mimeType: 'text/plain',
                            text: result[0].definition as string,
                        },
                    ],
                };
            }
        }

        // RLS policies resource
        if (uri.startsWith(RESOURCE_SCHEMES.RLS)) {
            const match = uri.match(new RegExp(`^${RESOURCE_SCHEMES.RLS}/([^/]+)/(.+)$`));
            if (match) {
                const [, schema, table] = match;
                const result = await executeSqlWithFallback(
                    client,
                    `SELECT schemaname, tablename, policyname, permissive, roles,
                            cmd, qual, with_check
                     FROM pg_policies
                     WHERE schemaname = '${schema}' AND tablename = '${table}'`,
                    true
                );

                if (!Array.isArray(result)) {
                    throw new Error(`Failed to read RLS policies: ${result.error?.message ?? 'Unknown error'}`);
                }

                return {
                    contents: [
                        {
                            uri,
                            mimeType: 'application/json',
                            text: JSON.stringify(
                                {
                                    schema,
                                    table,
                                    policies: result,
                                },
                                null,
                                2
                            ),
                        },
                    ],
                };
            }
        }

        throw new Error(`Unknown resource URI: ${uri}`);
    });
}
