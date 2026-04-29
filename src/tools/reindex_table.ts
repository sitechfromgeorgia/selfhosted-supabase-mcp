/**
 * reindex_table — Rebuilds indexes on a table or database.
 *
 * Supports CONCURRENTLY for zero-downtime reindexing.
 * Privileged tool.
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';
import { validateIdentifiers, quoteIdentifier } from './ddl-utils.js';

const ReindexTableInputSchema = z.object({
    schema: z.string().optional().default('public'),
    table: z.string().optional().describe('Target table (omit for entire database)'),
    index_name: z.string().optional().describe('Specific index to rebuild (omit for all indexes on table)'),
    concurrently: z.boolean().optional().default(true).describe('Use CONCURRENTLY to avoid locking'),
    dry_run: z.boolean().optional().default(false),
});

type ReindexTableInput = z.infer<typeof ReindexTableInputSchema>;

const ReindexTableOutputSchema = z.object({
    success: z.boolean(),
    sql: z.string(),
    message: z.string(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        schema: { type: 'string', default: 'public' },
        table: { type: 'string' },
        index_name: { type: 'string' },
        concurrently: { type: 'boolean', default: true },
        dry_run: { type: 'boolean', default: false },
    },
    required: [],
};

export const reindexTableTool = {
    name: 'reindex_table',
    description: 'Rebuilds indexes to fix corruption or bloat. CONCURRENTLY is recommended for production.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: ReindexTableInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: ReindexTableOutputSchema,

    execute: async (input: ReindexTableInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { schema, table, index_name, concurrently, dry_run } = input;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        let sql = 'REINDEX';
        if (concurrently) sql += ' TABLE CONCURRENTLY';
        else sql += ' TABLE';

        if (index_name) {
            validateIdentifiers([
                { name: schema, context: 'Schema' },
                { name: index_name, context: 'Index' },
            ]);
            sql += ` ${quoteIdentifier(schema)}.${quoteIdentifier(index_name)}`;
        } else if (table) {
            validateIdentifiers([
                { name: schema, context: 'Schema' },
                { name: table, context: 'Table' },
            ]);
            sql += ` ${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
        } else {
            sql = concurrently ? 'REINDEX DATABASE CONCURRENTLY' : 'REINDEX DATABASE';
            sql += ` ${quoteIdentifier(schema)}`;
        }
        sql += ';';

        if (dry_run) {
            return {
                success: true,
                sql,
                message: 'DRY RUN: SQL prepared but not executed.',
            };
        }

        context.log(`Rebuilding indexes...`, 'info');

        const result = await client.executeSqlWithPg(sql);

        if ('error' in result) {
            throw new Error(`REINDEX failed: ${result.error.message}`);
        }

        return {
            success: true,
            sql,
            message: `Indexes rebuilt successfully${table ? ' on ' + schema + '.' + table : ''}${index_name ? ' for index ' + index_name : ''}.`,
        };
    },
};
