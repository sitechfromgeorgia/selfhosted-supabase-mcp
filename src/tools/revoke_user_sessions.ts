/**
 * revoke_user_sessions — Signs out a user from all devices.
 *
 * Deletes all auth.sessions rows for a user.
 * Privileged tool.
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';

const RevokeUserSessionsInputSchema = z.object({
    user_id: z.string().uuid().describe('User UUID to sign out everywhere'),
    dry_run: z.boolean().optional().default(false),
});

type RevokeUserSessionsInput = z.infer<typeof RevokeUserSessionsInputSchema>;

const RevokeUserSessionsOutputSchema = z.object({
    success: z.boolean(),
    message: z.string(),
    revoked_count: z.number(),
    user_id: z.string(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        user_id: { type: 'string' },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['user_id'],
};

export const revokeUserSessionsTool = {
    name: 'revoke_user_sessions',
    description: 'Signs out a user from all devices by revoking all active sessions.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: RevokeUserSessionsInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: RevokeUserSessionsOutputSchema,

    execute: async (input: RevokeUserSessionsInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { user_id, dry_run } = input;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        if (dry_run) {
            return {
                success: true,
                message: `DRY RUN: Would revoke all sessions for user ${user_id}.`,
                revoked_count: 0,
                user_id,
            };
        }

        context.log(`Revoking all sessions for user ${user_id}...`, 'info');

        const result = await client.executeSqlWithPg(
            'DELETE FROM auth.sessions WHERE user_id = $1',
            [user_id]
        );

        if ('error' in result) {
            throw new Error(`Failed to revoke sessions: ${result.error.message}`);
        }

        // pg DELETE does not return row count in the same way as SELECT
        // We need to check via count query before delete
        return {
            success: true,
            message: `All sessions for user ${user_id} revoked successfully.`,
            revoked_count: -1, // Cannot determine exact count from generic result
            user_id,
        };
    },
};
