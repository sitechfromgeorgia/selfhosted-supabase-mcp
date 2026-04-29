/**
 * bulk_update_auth_users — Batch updates auth user metadata/roles.
 *
 * Safety Features:
 * - Validates UUIDs
 * - Max batch size (100)
 * - Supports partial updates (only specified fields)
 * - Privileged tool
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';
import type { PoolClient } from 'pg';

const MAX_BATCH_SIZE = 100;

const UserUpdateSchema = z.object({
    user_id: z.string().uuid(),
    role: z.string().optional(),
    email: z.string().email().optional(),
    user_metadata: z.record(z.any()).optional(),
    app_metadata: z.record(z.any()).optional(),
    email_confirmed: z.boolean().optional(),
    banned_until: z.string().optional().describe('ISO 8601 timestamp or null to unban'),
});

const BulkUpdateAuthUsersInputSchema = z.object({
    updates: z.array(UserUpdateSchema).min(1).max(MAX_BATCH_SIZE),
    dry_run: z.boolean().optional().default(false),
});

type BulkUpdateAuthUsersInput = z.infer<typeof BulkUpdateAuthUsersInputSchema>;

const BulkUpdateAuthUsersOutputSchema = z.object({
    success: z.boolean(),
    message: z.string(),
    updated_count: z.number(),
    users: z.array(z.object({
        id: z.string(),
        updated: z.boolean(),
        error: z.string().optional(),
    })),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        updates: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    user_id: { type: 'string' },
                    role: { type: 'string' },
                    email: { type: 'string' },
                    user_metadata: { type: 'object' },
                    app_metadata: { type: 'object' },
                    email_confirmed: { type: 'boolean' },
                    banned_until: { type: 'string' },
                },
                required: ['user_id'],
            },
        },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['updates'],
};

export const bulkUpdateAuthUsersTool = {
    name: 'bulk_update_auth_users',
    description: `Batch updates up to ${MAX_BATCH_SIZE} auth users. Supports role, metadata, email, ban status.`,
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: BulkUpdateAuthUsersInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: BulkUpdateAuthUsersOutputSchema,

    execute: async (input: BulkUpdateAuthUsersInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { updates, dry_run } = input;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required for bulk user updates.');
        }

        if (dry_run) {
            return {
                success: true,
                message: `DRY RUN: Would update ${updates.length} users.`,
                updated_count: 0,
                users: updates.map((u) => ({ id: u.user_id, updated: false, error: 'DRY RUN' })),
            };
        }

        context.log(`Bulk updating ${updates.length} auth users...`, 'info');

        const results = await client.executeTransactionWithPg(async (pgClient: PoolClient) => {
            const updated: Array<{ id: string; updated: boolean; error?: string }> = [];

            for (const up of updates) {
                try {
                    const sets: string[] = [];
                    const params: any[] = [];
                    let idx = 1;

                    if (up.role !== undefined) { sets.push(`role = $${idx++}`); params.push(up.role); }
                    if (up.email !== undefined) { sets.push(`email = $${idx++}`); params.push(up.email); }
                    if (up.user_metadata !== undefined) { sets.push(`raw_user_meta_data = $${idx++}::jsonb`); params.push(JSON.stringify(up.user_metadata)); }
                    if (up.app_metadata !== undefined) { sets.push(`raw_app_meta_data = $${idx++}::jsonb`); params.push(JSON.stringify(up.app_metadata)); }
                    if (up.email_confirmed !== undefined) { sets.push(`email_confirmed_at = CASE WHEN $${idx++} THEN now() ELSE null END`); params.push(up.email_confirmed); }
                    if (up.banned_until !== undefined) { sets.push(`banned_until = $${idx++}::timestamptz`); params.push(up.banned_until); }

                    if (sets.length === 0) {
                        updated.push({ id: up.user_id, updated: false, error: 'No fields to update' });
                        continue;
                    }

                    sets.push(`updated_at = now()`);
                    params.push(up.user_id);

                    const sql = `UPDATE auth.users SET ${sets.join(', ')} WHERE id = $${idx} RETURNING id`;
                    const result = await pgClient.query(sql, params);

                    if (result.rowCount === 0) {
                        updated.push({ id: up.user_id, updated: false, error: 'User not found' });
                    } else {
                        updated.push({ id: up.user_id, updated: true });
                    }
                } catch (err: any) {
                    updated.push({ id: up.user_id, updated: false, error: err.message });
                }
            }

            return updated;
        });

        const successCount = results.filter((r) => r.updated).length;

        return {
            success: successCount === updates.length,
            message: `Updated ${successCount}/${updates.length} users.${successCount < updates.length ? ' Some failed — check per-user errors.' : ''}`,
            updated_count: successCount,
            users: results,
        };
    },
};
