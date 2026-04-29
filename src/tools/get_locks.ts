/**
 * get_locks — Returns current lock waits and blocking queries.
 *
 * Regular tool.
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';

const GetLocksInputSchema = z.object({
    limit: z.number().int().positive().max(100).optional().default(20),
});

type GetLocksInput = z.infer<typeof GetLocksInputSchema>;

const LockSchema = z.object({
    blocked_pid: z.number().nullable(),
    blocked_user: z.string().nullable(),
    blocking_pid: z.number().nullable(),
    blocking_user: z.string().nullable(),
    blocked_statement: z.string().nullable(),
    blocking_statement: z.string().nullable(),
    lock_mode: z.string().nullable(),
    lock_duration: z.string().nullable(),
});

const GetLocksOutputSchema = z.object({
    success: z.boolean(),
    locks: z.array(LockSchema),
    count: z.number(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        limit: { type: 'number', default: 20 },
    },
    required: [],
};

export const getLocksTool = {
    name: 'get_locks',
    description: 'Returns current lock waits and blocking queries. Useful for diagnosing deadlocks and slow transactions.',
    privilegeLevel: 'regular' as ToolPrivilegeLevel,
    inputSchema: GetLocksInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: GetLocksOutputSchema,

    execute: async (input: GetLocksInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { limit } = input;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        context.log('Fetching lock waits...', 'info');

        const result = await client.executeSqlWithPg(
            `SELECT
                blocked_locks.pid as blocked_pid,
                blocked_activity.usename as blocked_user,
                blocking_locks.pid as blocking_pid,
                blocking_activity.usename as blocking_user,
                LEFT(blocked_activity.query, 100) as blocked_statement,
                LEFT(blocking_activity.query, 100) as blocking_statement,
                blocked_locks.mode as lock_mode,
                NOW() - blocked_activity.query_start::timestamp as lock_duration
            FROM pg_catalog.pg_locks blocked_locks
            JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
            JOIN pg_catalog.pg_locks blocking_locks
                ON blocking_locks.locktype = blocked_locks.locktype
                AND blocking_locks.relation = blocked_locks.relation
                AND blocking_locks.pid != blocked_locks.pid
            JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
            WHERE NOT blocked_locks.granted
            LIMIT $1`,
            [limit]
        );

        if ('error' in result) {
            throw new Error(`Failed to fetch locks: ${result.error.message}`);
        }

        const locks = result as any[];

        return {
            success: true,
            locks,
            count: locks.length,
        };
    },
};
