/**
 * get_cache_hit_ratio — Returns buffer cache effectiveness.
 *
 * Regular tool.
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';

const GetCacheHitRatioInputSchema = z.object({
    schema: z.string().optional().describe('Filter by schema (omit for database-wide)'),
});

type GetCacheHitRatioInput = z.infer<typeof GetCacheHitRatioInputSchema>;

const CacheHitSchema = z.object({
    schema_name: z.string().nullable(),
    table_name: z.string().nullable(),
    heap_reads: z.number().nullable(),
    heap_hits: z.number().nullable(),
    hit_ratio: z.number().nullable(),
});

const GetCacheHitRatioOutputSchema = z.object({
    success: z.boolean(),
    overall_ratio: z.number(),
    tables: z.array(CacheHitSchema),
    low_hit_ratio_tables: z.array(CacheHitSchema),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        schema: { type: 'string' },
    },
    required: [],
};

export const getCacheHitRatioTool = {
    name: 'get_cache_hit_ratio',
    description: 'Returns buffer cache hit ratio per table and database-wide. Low ratios indicate insufficient shared_buffers.',
    privilegeLevel: 'regular' as ToolPrivilegeLevel,
    inputSchema: GetCacheHitRatioInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: GetCacheHitRatioOutputSchema,

    execute: async (input: GetCacheHitRatioInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { schema } = input;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        context.log('Fetching cache hit ratio...', 'info');

        // Database-wide ratio
        const overallResult = await client.executeSqlWithPg(
            `SELECT
                round(sum(heap_blks_hit)::numeric / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0) * 100, 2) as ratio
            FROM pg_statio_user_tables`
        );

        const overallRatio = ('error' in overallResult)
            ? 0
            : parseFloat((overallResult as any[])[0]?.ratio || '0');

        // Per-table ratio
        let sql = `
            SELECT
                schemaname as schema_name,
                relname as table_name,
                heap_blks_read as heap_reads,
                heap_blks_hit as heap_hits,
                round(heap_blks_hit::numeric / nullif(heap_blks_hit + heap_blks_read, 0) * 100, 2) as hit_ratio
            FROM pg_statio_user_tables
            WHERE 1=1
        `;
        const params: any[] = [];

        if (schema) {
            sql += ' AND schemaname = $1';
            params.push(schema);
        }

        sql += ' ORDER BY hit_ratio ASC NULLS LAST';

        const result = await client.executeSqlWithPg(sql, params);

        if ('error' in result) {
            throw new Error(`Failed to fetch cache hit ratio: ${result.error.message}`);
        }

        const tables = result as any[];
        const lowHitTables = tables.filter((t) => t.hit_ratio !== null && t.hit_ratio < 95);

        return {
            success: true,
            overall_ratio: overallRatio,
            tables,
            low_hit_ratio_tables: lowHitTables,
        };
    },
};
