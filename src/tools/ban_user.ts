/**
 * ban_user — Bans a user by setting banned_until to a future date.
 *
 * Uses direct pg connection. Supports permanent ban (no expiry).
 * Privileged tool.
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';

const BanUserInputSchema = z.object({
    user_id: z.string().uuid().describe('User UUID to ban'),
    reason: z.string().optional().describe('Ban reason (stored in app_metadata)'),
    banned_until: z.string().optional().describe('ISO 8601 expiry (omit for permanent ban)'),
    dry_run: z.boolean().optional().default(false),
});

type BanUserInput = z.infer<typeof BanUserInputSchema>;

const BanUserOutputSchema = z.object({
    success: z.boolean(),
    message: z.string(),
    user_id: z.string(),
    banned_until: z.string().nullable(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        user_id: { type: 'string' },
        reason: { type: 'string' },
        banned_until: { type: 'string' },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['user_id'],
};

export const banUserTool = {
    name: 'ban_user',
    description: 'Bans a user permanently or until a specified date. Optionally records a reason in app_metadata.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: BanUserInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: BanUserOutputSchema,

    execute: async (input: BanUserInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { user_id, reason, banned_until, dry_run } = input;
        const expiry = banned_until || '9999-12-31T23:59:59Z';

        if (dry_run) {
            return { success: true, message: `DRY RUN: Would ban user ${user_id} until ${expiry}.${reason ? ' Reason: ' + reason : ''}`, user_id, banned_until: expiry };
        }

        // 1. Try Supabase Admin API
        const serviceRoleClient = client.getServiceRoleClient();
        if (serviceRoleClient) {
            console.error(`Banning user ${user_id} via Supabase Admin API...`);
            // Calculate duration string for ban_duration
            let duration: string;
            if (banned_until) {
                const nowMs = Date.now();
                const expiryMs = new Date(banned_until).getTime();
                const diffHours = Math.ceil((expiryMs - nowMs) / (1000 * 60 * 60));
                duration = diffHours > 0 ? `${diffHours}h` : '1h';
            } else {
                duration = '100y'; // Permanent-ish
            }
            const { data, error } = await serviceRoleClient.auth.admin.updateUserById(user_id, { ban_duration: duration });
            if (error) {
                context.log(`Supabase Admin API failed: ${error.message}. Falling back to DB...`, 'warn');
            } else {
                console.error(`Successfully banned user ${user_id} via API.`);
                return { success: true, message: `User ${user_id} banned until ${expiry}.${reason ? ' Reason recorded.' : ''}`, user_id, banned_until: expiry };
            }
        }

        // 2. Fallback to direct DB
        if (!client.isPgAvailable()) {
            throw new Error('Neither Supabase service role key (for Admin API) nor direct database connection (DATABASE_URL) is available. Cannot ban user.');
        }

        context.log(`Banning user ${user_id} until ${expiry}...`, 'info');
        let metadataSql = '';
        if (reason) metadataSql = `, raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('ban_reason', $3::text)`;
        const sql = `UPDATE auth.users SET banned_until = $1::timestamptz, updated_at = now()${metadataSql} WHERE id = $2 RETURNING id, banned_until::text`;
        const params: any[] = [expiry, user_id];
        if (reason) params.push(reason);

        const result = await client.executeSqlWithPg(sql, params);
        if ('error' in result) throw new Error(`Failed to ban user: ${result.error.message}`);
        const rows = result as any[];
        if (rows.length === 0) throw new Error(`User ${user_id} not found.`);
        return { success: true, message: `User ${user_id} banned until ${expiry}.${reason ? ' Reason recorded.' : ''}`, user_id, banned_until: rows[0].banned_until };
    },
};
