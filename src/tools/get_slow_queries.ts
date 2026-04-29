/**
 * get_slow_queries — Returns the slowest queries from pg_stat_statements.
 *
 * Requires pg_stat_statements extension to be enabled.
 * Regular tool.
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';

const GetSlowQueriesInputSchema = z.object({
    limit: z.number().int().positive().max(100).optional().default(10),
    min_calls: z.number().int().nonnegative().optional().default(1),
});

type GetSlowQueriesInput = z.infer<typeof GetSlowQueriesInputSchema>;

const SlowQuerySchema = z.object({
    queryid: z.number().nullable(),
    query: z.string().nullable(),
    calls: z.number().nullable(),
    total_exec_time: z.number().nullable(),
    mean_exec_time: z.number().nullable(),
    rows: z.number().nullable(),
});

const GetSlowQueriesOutputSchema = z.object({
    success: z.boolean(),
    queries: z.array(SlowQuerySchema),
    count: z.number(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        limit: { type: 'number', default: 10 },
        min_calls: { type: 'number', default: 1 },
    },
    required: [],
};

export const getSlowQueriesTool = {
    name: 'get_slow_queries',
    description: 'Returns the slowest queries from pg_stat_statements by mean execution time.',
    privilegeLevel: 'regular' as ToolPrivilegeLevel,
    inputSchema: GetSlowQueriesInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: GetSlowQueriesOutputSchema,

    execute: async (input: GetSlowQueriesInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { limit, min_calls } = input;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        context.log('Fetching slow queries...', 'info');

        const result = await client.executeSqlWithPg(
            `SELECT
                queryid,
                LEFT(query, 200) as query,
                calls,
                round(total_exec_time::numeric, 2) as total_exec_time,
                round(mean_exec_time::numeric, 2) as mean_exec_time,
                rows
            FROM pg_stat_statements
            WHERE calls >= $1
            ORDER BY mean_exec_time DESC
            LIMIT $2`,
            [min_calls, limit]
        );

        if ('error' in result) {
            if (result.error.message.includes('does not exist')) {
                throw new Error('pg_stat_statements extension is not enabled. Run: CREATE EXTENSION IF NOT EXISTS pg_stat_statements;');
            }
            throw new Error(`Failed to fetch slow queries: ${result.error.message}`);
        }

        const queries = result as any[];

        return {
            success: true,
            queries,
            count: queries.length,
        };
    },
};
