/**
 * MCP Prompts implementation for self-hosted Supabase MCP Server.
 *
 * Prompts provide reusable prompt templates for common database
 * management and analysis workflows.
 */

import {
    ListPromptsRequestSchema,
    GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

// Prompt definitions
const PROMPTS = [
    {
        name: 'analyze-slow-queries',
        title: 'Analyze Slow Queries',
        description: 'Guides you through finding and optimizing slow database queries using pg_stat_statements and EXPLAIN ANALYZE.',
        arguments: [],
    },
    {
        name: 'audit-security',
        title: 'Audit Database Security',
        description: 'Runs a comprehensive security audit covering RLS policies, authentication, advisors, and extension vulnerabilities.',
        arguments: [],
    },
    {
        name: 'migration-review',
        title: 'Review Migration Safety',
        description: 'Reviews a proposed SQL migration for common safety issues before applying it to the database.',
        arguments: [
            {
                name: 'sql',
                description: 'The SQL migration script to review',
                required: true,
            },
        ],
    },
    {
        name: 'optimize-indexes',
        title: 'Optimize Database Indexes',
        description: 'Analyzes table usage and suggests index optimizations based on query patterns.',
        arguments: [
            {
                name: 'table',
                description: 'The table name to analyze',
                required: false,
            },
        ],
    },
] as const;

/**
 * Registers prompt handlers on an MCP server instance.
 */
export function registerPromptHandlers(server: Server): void {
    // List available prompts
    server.setRequestHandler(ListPromptsRequestSchema, async () => {
        return {
            prompts: PROMPTS.map((p) => ({
                name: p.name,
                title: p.title,
                description: p.description,
                arguments: p.arguments.map((a) => ({
                    name: a.name,
                    description: a.description,
                    required: a.required,
                })),
            })),
        };
    });

    // Get a specific prompt by name
    server.setRequestHandler(GetPromptRequestSchema, async (request) => {
        const promptName = request.params.name;
        const args = request.params.arguments ?? {};

        switch (promptName) {
            case 'analyze-slow-queries': {
                return {
                    description: 'Step-by-step guide to analyze and optimize slow queries',
                    messages: [
                        {
                            role: 'user',
                            content: {
                                type: 'text',
                                text: `Please help me analyze slow queries in this Supabase database.

First, check if pg_stat_statements is available and show the top 10 slowest queries by total execution time.
Then pick the slowest query and run EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) on it to get detailed execution statistics.
Finally, suggest any index optimizations or query rewrites that might improve performance.

Use the get_database_stats, get_index_stats, and explain_query tools as needed.`,
                            },
                        },
                    ],
                };
            }

            case 'audit-security': {
                return {
                    description: 'Comprehensive database security audit checklist',
                    messages: [
                        {
                            role: 'user',
                            content: {
                                type: 'text',
                                text: `Please perform a comprehensive security audit of this Supabase database:

1. List all tables and check which ones have RLS enabled/disabled using get_rls_status
2. List all RLS policies using list_rls_policies for tables that have them
3. Run get_advisors to check for security and performance issues
4. List all installed extensions and check for any that might have known vulnerabilities
5. Check auth users for any suspicious patterns (e.g., unconfirmed emails, unusual roles)
6. Verify the JWT secret configuration

Provide a summary of findings and recommendations for any security gaps found.`,
                            },
                        },
                    ],
                };
            }

            case 'migration-review': {
                const sql = args.sql ?? '<no SQL provided>';
                return {
                    description: 'Review a SQL migration for safety issues before applying',
                    messages: [
                        {
                            role: 'user',
                            content: {
                                type: 'text',
                                text: `Please review the following SQL migration for safety issues before it is applied to the database:

\`\`\`sql
${sql}
\`\`\`

Check for:
1. Missing IF EXISTS / IF NOT EXISTS guards on DROP/CREATE statements
2. Potentially destructive operations (DROP TABLE, TRUNCATE) without backups
3. Lock-heavy operations on large tables that could cause downtime
4. Missing transaction boundaries
5. Columns without proper constraints or defaults
6. Index creations that might take a very long time
7. Any references to schemas or tables that don't exist

If the migration looks safe, confirm. If there are issues, explain them clearly and suggest fixes.`,
                            },
                        },
                    ],
                };
            }

            case 'optimize-indexes': {
                const table = args.table;
                const tableClause = table
                    ? `for the table \`${table}\``
                    : 'across all tables';
                return {
                    description: 'Analyze and suggest index optimizations',
                    messages: [
                        {
                            role: 'user',
                            content: {
                                type: 'text',
                                text: `Please analyze index usage ${tableClause} in this database:

1. List existing indexes and their usage statistics using get_index_stats
2. Check for duplicate or redundant indexes
3. Look for missing indexes on foreign key columns
4. Identify unused indexes that could be dropped
5. Check if any tables are missing primary keys

Provide specific recommendations with CREATE INDEX or DROP INDEX statements where appropriate.`,
                            },
                        },
                    ],
                };
            }

            default:
                throw new Error(`Unknown prompt: ${promptName}`);
        }
    });
}
