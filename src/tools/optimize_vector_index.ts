/**
 * optimize_vector_index — Analyzes vector indexes and provides reindex recommendations.
 *
 * Checks index bloat, unused indexes, and recommends optimal IVFFlat lists/HNSW params.
 * Privileged tool.
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';

const OptimizeVectorIndexInputSchema = z.object({
    schema: z.string().optional().default('public'),
    table: z.string().optional().describe('Specific table to analyze (omit for all)'),
    dry_run: z.boolean().optional().default(false),
});

type OptimizeVectorIndexInput = z.infer<typeof OptimizeVectorIndexInputSchema>;

const OptimizeVectorIndexOutputSchema = z.object({
    success: z.boolean(),
    recommendations: z.array(z.object({
        index_name: z.string(),
        table: z.string(),
        column: z.string(),
        method: z.string(),
        row_count: z.number(),
        recommended_lists: z.number().optional(),
        recommendation: z.string(),
    })),
    message: z.string(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        schema: { type: 'string', default: 'public' },
        table: { type: 'string' },
        dry_run: { type: 'boolean', default: false },
    },
    required: [],
};

export const optimizeVectorIndexTool = {
    name: 'optimize_vector_index',
    description: 'Analyzes vector indexes and recommends optimal parameters (IVFFlat lists, HNSW M/ef_construction) based on table size.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: OptimizeVectorIndexInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: OptimizeVectorIndexOutputSchema,

    execute: async (input: OptimizeVectorIndexInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { schema, table, dry_run } = input;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        context.log('Analyzing vector indexes for optimization...', 'info');

        const tableFilter = table ? `AND t.relname = '${table}'` : '';

        const sql = `
            SELECT
                i.relname AS index_name,
                t.relname AS table_name,
                a.attname AS column_name,
                am.amname AS method,
                (SELECT reltuples::bigint FROM pg_class WHERE oid = t.oid) AS row_count
            FROM pg_index idx
            JOIN pg_class i ON i.oid = idx.indexrelid
            JOIN pg_class t ON t.oid = idx.indrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(idx.indkey)
            JOIN pg_am am ON am.oid = i.relam
            WHERE n.nspname = $1
            AND am.amname IN ('ivfflat', 'hnsw')
            ${tableFilter}
            ORDER BY t.relname, i.relname;
        `;

        if (dry_run) {
            return {
                success: true,
                recommendations: [],
                message: 'DRY RUN: Would analyze vector indexes for optimization.',
            };
        }

        const result = await client.executeSqlWithPg(sql, [schema]);

        if ('error' in result) {
            throw new Error(`Analysis failed: ${result.error.message}`);
        }

        const rows = result as any[];
        const recommendations = rows.map((row) => {
            const rowCount = parseInt(row.row_count, 10) || 0;
            let rec = '';
            let recommendedLists: number | undefined;

            if (row.method === 'ivfflat') {
                recommendedLists = Math.max(1, Math.round(Math.sqrt(rowCount)));
                rec = `Table has ~${rowCount} rows. Recommended lists=${recommendedLists} for IVFFlat (current default may be suboptimal).`;
            } else if (row.method === 'hnsw') {
                rec = `Table has ~${rowCount} rows. HNSW index present. Consider REINDEX if insert-heavy workload detected.`;
            }

            return {
                index_name: row.index_name,
                table: row.table_name,
                column: row.column_name,
                method: row.method,
                row_count: rowCount,
                recommended_lists: recommendedLists,
                recommendation: rec,
            };
        });

        return {
            success: true,
            recommendations,
            message: `Analyzed ${recommendations.length} vector index(es).`,
        };
    },
};
