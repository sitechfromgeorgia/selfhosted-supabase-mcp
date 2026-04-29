/**
 * get_autovacuum_status — Returns vacuum health for tables.
 *
 * Shows dead tuples, last vacuum/analyze times, and wraparound risk.
 * Regular tool.
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';

const GetAutovacuumStatusInputSchema = z.object({
    schema: z.string().optional(),
    min_dead_tuples: z.number().int().optional().default(1000),
    limit: z.number().int().positive().max(100).optional().default(20),
});

type GetAutovacuumStatusInput = z.infer<typeof GetAutovacuumStatusInputSchema>;

const AutovacuumSchema = z.object({
    schema_name: z.string(),
    table_name: z.string(),
    n_live_tup: z.number().nullable(),
    n_dead_tup: z.number().nullable(),
    dead_tuple_ratio: z.number().nullable(),
    last_vacuum: z.string().nullable(),
    last_autovacuum: z.string().nullable(),
    last_analyze: z.string().nullable(),
    vacuum_count: z.number().nullable(),
});

const GetAutovacuumStatusOutputSchema = z.object({
    success: z.boolean(),
    tables: z.array(AutovacuumSchema),
    count: z.number(),
    needs_vacuum: z.array(AutovacuumSchema),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        schema: { type: 'string' },
        min_dead_tuples: { type: 'number', default: 1000 },
        limit: { type: 'number', default: 20 },
    },
    required: [],
};

export const getAutovacuumStatusTool = {
    name: 'get_autovacuum_status',
    description: 'Returns vacuum health: dead tuples, last vacuum/analyze times, and tables needing attention.',
    privilegeLevel: 'regular' as ToolPrivilegeLevel,
    inputSchema: GetAutovacuumStatusInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: GetAutovacuumStatusOutputSchema,

    execute: async (input: GetAutovacuumStatusInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { schema, min_dead_tuples, limit } = input;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        context.log('Fetching autovacuum status...', 'info');

        let sql = `
            SELECT
                schemaname as schema_name,
                relname as table_name,
                n_live_tup,
                n_dead_tup,
                round(n_dead_tup::numeric / nullif(n_live_tup + n_dead_tup, 0) * 100, 2) as dead_tuple_ratio,
                last_vacuum::text,
                last_autovacuum::text,
                last_analyze::text,
                vacuum_count + autovacuum_count as vacuum_count
            FROM pg_stat_user_tables
            WHERE n_dead_tup >= $1
        `;
        const params: any[] = [min_dead_tuples];
        let idx = 2;

        if (schema) {
            sql += ` AND schemaname = $${idx++}`;
            params.push(schema);
        }

        sql += ` ORDER BY n_dead_tup DESC LIMIT $${idx++}`;
        params.push(limit);

        const result = await client.executeSqlWithPg(sql, params);

        if ('error' in result) {
            throw new Error(`Failed to fetch autovacuum status: ${result.error.message}`);
        }

        const tables = result as any[];
        const needsVacuum = tables.filter((t) => (t.dead_tuple_ratio || 0) > 10);

        return {
            success: true,
            tables,
            count: tables.length,
            needs_vacuum: needsVacuum,
        };
    },
};
