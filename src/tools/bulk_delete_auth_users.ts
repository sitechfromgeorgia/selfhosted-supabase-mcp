/**
 * bulk_delete_auth_users — Batch deletes auth users by UUID array.
 *
 * Safety Features:
 * - Validates UUID format
 * - Max batch size limit (100)
 * - Returns per-user deletion status
 * - Privileged tool
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';
import type { PoolClient } from 'pg';

const MAX_BATCH_SIZE = 100;

const BulkDeleteAuthUsersInputSchema = z.object({
    user_ids: z.array(z.string().uuid()).min(1).max(MAX_BATCH_SIZE),
    dry_run: z.boolean().optional().default(false),
});

type BulkDeleteAuthUsersInput = z.infer<typeof BulkDeleteAuthUsersInputSchema>;

const BulkDeleteAuthUsersOutputSchema = z.object({
    success: z.boolean(),
    message: z.string(),
    deleted_count: z.number(),
    users: z.array(z.object({
        id: z.string(),
        deleted: z.boolean(),
        error: z.string().optional(),
    })),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        user_ids: { type: 'array', items: { type: 'string' } },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['user_ids'],
};

export const bulkDeleteAuthUsersTool = {
    name: 'bulk_delete_auth_users',
    description: `Batch deletes up to ${MAX_BATCH_SIZE} auth users by UUID. Also cleans up related sessions.`,
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: BulkDeleteAuthUsersInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: BulkDeleteAuthUsersOutputSchema,

    execute: async (input: BulkDeleteAuthUsersInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { user_ids, dry_run } = input;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required for bulk user deletion.');
        }

        if (dry_run) {
            return {
                success: true,
                message: `DRY RUN: Would delete ${user_ids.length} users.`,
                deleted_count: 0,
                users: user_ids.map((id) => ({ id, deleted: false, error: 'DRY RUN' })),
            };
        }

        context.log(`Bulk deleting ${user_ids.length} auth users...`, 'info');

        const results = await client.executeTransactionWithPg(async (pgClient: PoolClient) => {
            const deleted: Array<{ id: string; deleted: boolean; error?: string }> = [];

            for (const id of user_ids) {
                try {
                    // Delete sessions first (FK constraint)
                    await pgClient.query('DELETE FROM auth.sessions WHERE user_id = $1', [id]);
                    // Delete user
                    const result = await pgClient.query('DELETE FROM auth.users WHERE id = $1 RETURNING id', [id]);
                    if (result.rowCount === 0) {
                        deleted.push({ id, deleted: false, error: 'User not found' });
                    } else {
                        deleted.push({ id, deleted: true });
                    }
                } catch (err: any) {
                    deleted.push({ id, deleted: false, error: err.message });
                }
            }

            return deleted;
        });

        const successCount = results.filter((r) => r.deleted).length;

        return {
            success: successCount === user_ids.length,
            message: `Deleted ${successCount}/${user_ids.length} users.${successCount < user_ids.length ? ' Some failed — check per-user errors.' : ''}`,
            deleted_count: successCount,
            users: results,
        };
    },
};
