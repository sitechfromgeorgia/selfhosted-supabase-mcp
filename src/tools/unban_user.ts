/**
 * unban_user — Removes a ban from a user by clearing banned_until.
 *
 * Uses direct pg connection.
 * Privileged tool.
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';

const UnbanUserInputSchema = z.object({
    user_id: z.string().uuid().describe('User UUID to unban'),
    dry_run: z.boolean().optional().default(false),
});

type UnbanUserInput = z.infer<typeof UnbanUserInputSchema>;

const UnbanUserOutputSchema = z.object({
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

export const unbanUserTool = {
    name: 'unban_user',
    description: 'Removes a ban from a user, allowing them to sign in again.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: UnbanUserInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: UnbanUserOutputSchema,

    execute: async (input: UnbanUserInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { user_id, dry_run } = input;

        if (dry_run) {
            return { success: true, message: `DRY RUN: Would unban user ${user_id}.`, user_id };
        }

        // 1. Try Supabase Admin API
        const serviceRoleClient = client.getServiceRoleClient();
        if (serviceRoleClient) {
            console.error(`Unbanning user ${user_id} via Supabase Admin API...`);
            const { error } = await serviceRoleClient.auth.admin.updateUserById(user_id, { ban_duration: 'none' });
            if (error) {
                context.log(`Supabase Admin API failed: ${error.message}. Falling back to DB...`, 'warn');
            } else {
                console.error(`Successfully unbanned user ${user_id} via API.`);
                return { success: true, message: `User ${user_id} unbanned successfully.`, user_id };
            }
        }

        // 2. Fallback to direct DB
        if (!client.isPgAvailable()) {
            throw new Error('Neither Supabase service role key (for Admin API) nor direct database connection (DATABASE_URL) is available. Cannot unban user.');
        }

        context.log(`Unbanning user ${user_id}...`, 'info');
        const result = await client.executeSqlWithPg(
            `UPDATE auth.users SET banned_until = null, updated_at = now() WHERE id = $1 RETURNING id`,
            [user_id]
        );
        if ('error' in result) throw new Error(`Failed to unban user: ${result.error.message}`);
        const rows = result as any[];
        if (rows.length === 0) throw new Error(`User ${user_id} not found.`);
        return { success: true, message: `User ${user_id} unbanned successfully.`, user_id };
    },
};
