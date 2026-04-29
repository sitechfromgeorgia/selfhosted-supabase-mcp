/**
 * confirm_user_email — Manually confirms a user's email address.
 *
 * Updates auth.users.email_confirmed_at directly via pg.
 * Privileged tool.
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';

const ConfirmUserEmailInputSchema = z.object({
    user_id: z.string().uuid().describe('User UUID to confirm'),
    dry_run: z.boolean().optional().default(false),
});

type ConfirmUserEmailInput = z.infer<typeof ConfirmUserEmailInputSchema>;

const ConfirmUserEmailOutputSchema = z.object({
    success: z.boolean(),
    message: z.string(),
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

export const confirmUserEmailTool = {
    name: 'confirm_user_email',
    description: 'Manually confirms a user\'s email address without sending a confirmation link.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: ConfirmUserEmailInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: ConfirmUserEmailOutputSchema,

    execute: async (input: ConfirmUserEmailInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { user_id, dry_run } = input;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        if (dry_run) {
            return {
                success: true,
                message: `DRY RUN: Would confirm email for user ${user_id}.`,
                user_id,
            };
        }

        context.log(`Confirming email for user ${user_id}...`, 'info');

        const result = await client.executeSqlWithPg(
            `UPDATE auth.users SET email_confirmed_at = now(), updated_at = now() WHERE id = $1 RETURNING id`,
            [user_id]
        );

        if ('error' in result) {
            throw new Error(`Failed to confirm email: ${result.error.message}`);
        }

        const rows = result as any[];
        if (rows.length === 0) {
            throw new Error(`User ${user_id} not found.`);
        }

        return {
            success: true,
            message: `Email confirmed for user ${user_id}.`,
            user_id,
        };
    },
};
