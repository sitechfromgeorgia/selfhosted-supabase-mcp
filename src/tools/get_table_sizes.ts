/**
 * get_table_sizes — Returns per-table disk usage including indexes and TOAST.
 *
 * Regular tool.
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';

const GetTableSizesInputSchema = z.object({
    schema: z.string().optional().describe('Filter by schema (omit for all)'),
    min_size_mb: z.number().optional().describe('Only show tables larger than X MB'),
    limit: z.number().int().positive().max(200).optional().default(50),
});

type GetTableSizesInput = z.infer<typeof GetTableSizesInputSchema>;

const TableSizeSchema = z.object({
    schema_name: z.string(),
    table_name: z.string(),
    row_count: z.number().nullable(),
    table_size_mb: z.number().nullable(),
    indexes_size_mb: z.number().nullable(),
    total_size_mb: z.number().nullable(),
    toast_size_mb: z.number().nullable(),
});

const GetTableSizesOutputSchema = z.object({
    success: z.boolean(),
    tables: z.array(TableSizeSchema),
    count: z.number(),
    total_size_mb: z.number(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        schema: { type: 'string' },
        min_size_mb: { type: 'number' },
        limit: { type: 'number', default: 50 },
    },
    required: [],
};

export const getTableSizesTool = {
    name: 'get_table_sizes',
    description: 'Returns per-table disk usage including indexes and TOAST data.',
    privilegeLevel: 'regular' as ToolPrivilegeLevel,
    inputSchema: GetTableSizesInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: GetTableSizesOutputSchema,

    execute: async (input: GetTableSizesInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { schema, min_size_mb, limit } = input;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        context.log('Fetching table sizes...', 'info');

        let sql = `
            SELECT
                schemaname as schema_name,
                relname as table_name,
                n_live_tup as row_count,
                round(pg_total_relation_size(relid)::numeric / 1024 / 1024, 2) as total_size_mb,
                round(pg_table_size(relid)::numeric / 1024 / 1024, 2) as table_size_mb,
                round(pg_indexes_size(relid)::numeric / 1024 / 1024, 2) as indexes_size_mb,
                round(COALESCE(pg_total_relation_size(relid) - pg_table_size(relid) - pg_indexes_size(relid), 0)::numeric / 1024 / 1024, 2) as toast_size_mb
            FROM pg_stat_user_tables
            WHERE 1=1
        `;
        const params: any[] = [];
        let idx = 1;

        if (schema) {
            sql += ` AND schemaname = $${idx++}`;
            params.push(schema);
        }

        sql += ` ORDER BY pg_total_relation_size(relid) DESC LIMIT $${idx++}`;
        params.push(limit);

        const result = await client.executeSqlWithPg(sql, params);

        if ('error' in result) {
            throw new Error(`Failed to fetch table sizes: ${result.error.message}`);
        }

        const tables = result as any[];
        const filtered = min_size_mb
            ? tables.filter((t) => (t.total_size_mb || 0) >= min_size_mb)
            : tables;

        const totalSize = filtered.reduce((sum, t) => sum + (t.total_size_mb || 0), 0);

        return {
            success: true,
            tables: filtered,
            count: filtered.length,
            total_size_mb: totalSize,
        };
    },
};
