/**
 * pg_terminate_backend — Terminates a running database process (query/connection).
 *
 * Use with caution. Requires the PID of the backend to terminate.
 * Privileged tool.
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';

const PgTerminateBackendInputSchema = z.object({
    pid: z.number().int().positive().describe('Process ID (PID) to terminate'),
    reason: z.string().optional().describe('Reason for termination (logged for audit)'),
    dry_run: z.boolean().optional().default(false),
});

type PgTerminateBackendInput = z.infer<typeof PgTerminateBackendInputSchema>;

const PgTerminateBackendOutputSchema = z.object({
    success: z.boolean(),
    message: z.string(),
    pid: z.number(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        pid: { type: 'number' },
        reason: { type: 'string' },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['pid'],
};

export const pgTerminateBackendTool = {
    name: 'pg_terminate_backend',
    description: 'Terminates a runaway or stuck database process by PID. Use list_database_connections to find PIDs.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: PgTerminateBackendInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: PgTerminateBackendOutputSchema,

    execute: async (input: PgTerminateBackendInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { pid, reason, dry_run } = input;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        // Log audit info
        const userInfo = context.user
            ? `user=${context.user.email || context.user.userId}`
            : 'user=unknown';
        console.error(`[AUDIT] Terminate backend request by ${userInfo}: PID=${pid}${reason ? ' reason=' + reason : ''}`);

        if (dry_run) {
            return {
                success: true,
                message: `DRY RUN: Would terminate backend process ${pid}.${reason ? ' Reason: ' + reason : ''}`,
                pid,
            };
        }

        context.log(`Terminating backend process ${pid}...`, 'info');

        const result = await client.executeSqlWithPg(
            'SELECT pg_terminate_backend($1) as terminated',
            [pid]
        );

        if ('error' in result) {
            throw new Error(`Termination failed: ${result.error.message}`);
        }

        const rows = result as any[];
        const terminated = rows[0]?.terminated === true;

        return {
            success: terminated,
            message: terminated
                ? `Backend process ${pid} terminated successfully.`
                : `Backend process ${pid} could not be terminated (may not exist or insufficient privileges).`,
            pid,
        };
    },
};
