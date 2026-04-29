/**
 * get_connection_pool_stats — Returns connection pool statistics.
 *
 * Queries pg_stat_activity for active/idle connections.
 * Also checks max_connections setting.
 * Regular tool.
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';

const GetConnectionPoolStatsInputSchema = z.object({});

const PoolStatsSchema = z.object({
    state: z.string().nullable(),
    count: z.number(),
    max_duration: z.string().nullable(),
});

const GetConnectionPoolStatsOutputSchema = z.object({
    success: z.boolean(),
    total_connections: z.number(),
    max_connections: z.number(),
    usage_percent: z.number(),
    states: z.array(PoolStatsSchema),
    top_databases: z.array(z.record(z.any())),
    top_users: z.array(z.record(z.any())),
});

const mcpInputSchema = {
    type: 'object',
    properties: {},
    required: [],
};

export const getConnectionPoolStatsTool = {
    name: 'get_connection_pool_stats',
    description: 'Returns connection pool usage: active/idle connections, top databases/users, and utilization percentage.',
    privilegeLevel: 'regular' as ToolPrivilegeLevel,
    inputSchema: GetConnectionPoolStatsInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: GetConnectionPoolStatsOutputSchema,

    execute: async (input: typeof GetConnectionPoolStatsInputSchema._type, context: ToolContext) => {
        const client = context.selfhostedClient;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        context.log('Fetching connection pool stats...', 'info');

        // Max connections
        const maxResult = await client.executeSqlWithPg(
            `SELECT setting::int as max FROM pg_settings WHERE name = 'max_connections'`
        );
        const maxConnections = ('error' in maxResult)
            ? 100
            : (maxResult as any[])[0]?.max || 100;

        // Connection states
        const statesResult = await client.executeSqlWithPg(
            `SELECT
                state,
                count(*),
                max(NOW() - state_change)::text as max_duration
            FROM pg_stat_activity
            GROUP BY state`
        );

        const states = ('error' in statesResult) ? [] : statesResult as any[];
        const totalConnections = states.reduce((sum, s) => sum + parseInt(s.count || '0', 10), 0);

        // Top databases
        const dbResult = await client.executeSqlWithPg(
            `SELECT datname, count(*) as connections
            FROM pg_stat_activity
            GROUP BY datname
            ORDER BY connections DESC
            LIMIT 5`
        );

        // Top users
        const userResult = await client.executeSqlWithPg(
            `SELECT usename, count(*) as connections
            FROM pg_stat_activity
            GROUP BY usename
            ORDER BY connections DESC
            LIMIT 5`
        );

        return {
            success: true,
            total_connections: totalConnections,
            max_connections: maxConnections,
            usage_percent: maxConnections > 0 ? Math.round((totalConnections / maxConnections) * 100) : 0,
            states,
            top_databases: ('error' in dbResult) ? [] : dbResult as any[],
            top_users: ('error' in userResult) ? [] : userResult as any[],
        };
    },
};
