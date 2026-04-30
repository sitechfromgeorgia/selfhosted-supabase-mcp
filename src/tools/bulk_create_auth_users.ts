/**
 * bulk_create_auth_users — Batch creates multiple auth users.
 *
 * Safety Features:
 * - Transactional: all or nothing
 * - Duplicate email detection
 * - Max batch size limit (100)
 * - Privileged tool
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';
import type { PoolClient } from 'pg';

const MAX_BATCH_SIZE = 100;

const UserToCreateSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    role: z.string().optional().default('authenticated'),
    email_confirmed: z.boolean().optional().default(false),
    user_metadata: z.record(z.string(), z.any()).optional(),
    app_metadata: z.record(z.string(), z.any()).optional(),
});

const BulkCreateAuthUsersInputSchema = z.object({
    users: z.array(UserToCreateSchema).min(1).max(MAX_BATCH_SIZE),
    dry_run: z.boolean().optional().default(false),
});

type BulkCreateAuthUsersInput = z.infer<typeof BulkCreateAuthUsersInputSchema>;

const BulkCreateAuthUsersOutputSchema = z.object({
    success: z.boolean(),
    message: z.string(),
    created_count: z.number(),
    users: z.array(z.object({
        id: z.string(),
        email: z.string(),
        created: z.boolean(),
        error: z.string().optional(),
    })),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        users: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    email: { type: 'string' },
                    password: { type: 'string' },
                    role: { type: 'string' },
                    email_confirmed: { type: 'boolean' },
                    user_metadata: { type: 'object' },
                    app_metadata: { type: 'object' },
                },
                required: ['email', 'password'],
            },
        },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['users'],
};

export const bulkCreateAuthUsersTool = {
    name: 'bulk_create_auth_users',
    description: `Batch creates up to ${MAX_BATCH_SIZE} auth users in a single transaction. Uses pgcrypto for password hashing.`,
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: BulkCreateAuthUsersInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: BulkCreateAuthUsersOutputSchema,

    execute: async (input: BulkCreateAuthUsersInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { users, dry_run } = input;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required for bulk user creation.');
        }

        if (dry_run) {
            return {
                success: true,
                message: `DRY RUN: Would create ${users.length} users.`,
                created_count: 0,
                users: users.map((u) => ({ id: '', email: u.email, created: false, error: 'DRY RUN' })),
            };
        }

        context.log(`Bulk creating ${users.length} auth users...`, 'info');

        const results = await client.executeTransactionWithPg(async (pgClient: PoolClient) => {
            // Ensure pgcrypto is available
            try {
                await pgClient.query("SELECT crypt('test', gen_salt('bf'))");
            } catch {
                throw new Error('pgcrypto extension is required for password hashing.');
            }

            const created: Array<{ id: string; email: string; created: boolean; error?: string }> = [];

            for (const user of users) {
                try {
                    const sql = `
                        INSERT INTO auth.users (
                            instance_id, email, encrypted_password, role,
                            raw_app_meta_data, raw_user_meta_data,
                            aud, email_confirmed_at, confirmation_sent_at
                        )
                        VALUES (
                            COALESCE(current_setting('app.instance_id', TRUE), '00000000-0000-0000-0000-000000000000')::uuid,
                            $1, crypt($2, gen_salt('bf')), $3,
                            $4::jsonb, $5::jsonb,
                            'authenticated',
                            CASE WHEN $6 THEN now() ELSE null END,
                            CASE WHEN $6 THEN now() ELSE null END
                        )
                        RETURNING id;
                    `;
                    const params = [
                        user.email,
                        user.password,
                        user.role,
                        JSON.stringify(user.app_metadata || {}),
                        JSON.stringify(user.user_metadata || {}),
                        user.email_confirmed,
                    ];

                    const result = await pgClient.query(sql, params);
                    created.push({ id: result.rows[0].id, email: user.email, created: true });
                } catch (err: any) {
                    const msg = err.code === '23505' ? 'Email already exists' : err.message;
                    created.push({ id: '', email: user.email, created: false, error: msg });
                }
            }

            return created;
        });

        const successCount = results.filter((r) => r.created).length;

        return {
            success: successCount === users.length,
            message: `Created ${successCount}/${users.length} users.${successCount < users.length ? ' Some failed — check per-user errors.' : ''}`,
            created_count: successCount,
            users: results,
        };
    },
};
