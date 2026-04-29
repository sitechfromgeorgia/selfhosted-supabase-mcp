/**
 * get_deadlocks — Returns recent deadlock information from pg_log.
 *
 * Falls back to checking log_lock_waits setting.
 * Regular tool.
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';

const GetDeadlocksInputSchema = z.object({
    limit: z.number().int().positive().max(50).optional().default(10),
});

type GetDeadlocksInput = z.infer<typeof GetDeadlocksInputSchema>;

const DeadlockSchema = z.object({
    log_time: z.string().nullable(),
    message: z.string().nullable(),
    detail: z.string().nullable(),
});

const GetDeadlocksOutputSchema = z.object({
    success: z.boolean(),
    deadlocks: z.array(DeadlockSchema),
    count: z.number(),
    log_lock_waits_enabled: z.boolean(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        limit: { type: 'number', default: 10 },
    },
    required: [],
};

export const getDeadlocksTool = {
    name: 'get_deadlocks',
    description: 'Returns recent deadlock information from PostgreSQL logs.',
    privilegeLevel: 'regular' as ToolPrivilegeLevel,
    inputSchema: GetDeadlocksInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: GetDeadlocksOutputSchema,

    execute: async (input: GetDeadlocksInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { limit } = input;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        context.log('Fetching deadlock information...', 'info');

        // Check if log_lock_waits is enabled
        const settingResult = await client.executeSqlWithPg(
            `SELECT setting FROM pg_settings WHERE name = 'log_lock_waits'`
        );
        const logLockWaits = !('error' in settingResult) && (settingResult as any[])[0]?.setting === 'on';

        // Try to get from pg_log (if available)
        let deadlocks: any[] = [];
        try {
            const logResult = await client.executeSqlWithPg(
                `SELECT
                    log_time::text,
                    message,
                    detail
                FROM pg_log
                WHERE message LIKE '%deadlock detected%'
                ORDER BY log_time DESC
                LIMIT $1`,
                [limit]
            );
            if (!('error' in logResult)) {
                deadlocks = logResult as any[];
            }
        } catch {
            // pg_log may not be accessible
        }

        return {
            success: true,
            deadlocks,
            count: deadlocks.length,
            log_lock_waits_enabled: logLockWaits,
        };
    },
};
