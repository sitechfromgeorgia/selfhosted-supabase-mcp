/**
 * list_user_sessions — Lists active sessions for a user.
 *
 * Queries auth.sessions via pg.
 * Regular tool.
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';

const ListUserSessionsInputSchema = z.object({
    user_id: z.string().uuid().describe('User UUID'),
    limit: z.number().int().positive().optional().default(50),
    offset: z.number().int().nonnegative().optional().default(0),
});

type ListUserSessionsInput = z.infer<typeof ListUserSessionsInputSchema>;

const SessionSchema = z.object({
    id: z.string().uuid(),
    user_id: z.string().uuid(),
    created_at: z.string().nullable(),
    updated_at: z.string().nullable(),
    factor_id: z.string().nullable(),
    aal: z.string().nullable(),
    not_after: z.string().nullable(),
    refreshed_at: z.string().nullable(),
    user_agent: z.string().nullable(),
    ip: z.string().nullable(),
});

const ListUserSessionsOutputSchema = z.object({
    success: z.boolean(),
    sessions: z.array(SessionSchema),
    total: z.number(),
    user_id: z.string(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        user_id: { type: 'string' },
        limit: { type: 'number', default: 50 },
        offset: { type: 'number', default: 0 },
    },
    required: ['user_id'],
};

export const listUserSessionsTool = {
    name: 'list_user_sessions',
    description: 'Lists active sessions for a user (sign-in locations, devices, timestamps).',
    privilegeLevel: 'regular' as ToolPrivilegeLevel,
    inputSchema: ListUserSessionsInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: ListUserSessionsOutputSchema,

    execute: async (input: ListUserSessionsInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { user_id, limit, offset } = input;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        context.log(`Listing sessions for user ${user_id}...`, 'info');

        const countResult = await client.executeSqlWithPg(
            'SELECT COUNT(*) as total FROM auth.sessions WHERE user_id = $1',
            [user_id]
        );

        const total = ('error' in countResult) ? 0 : parseInt((countResult as any[])[0]?.total || '0', 10);

        const result = await client.executeSqlWithPg(
            `SELECT
                id, user_id,
                created_at::text, updated_at::text,
                factor_id::text, aal, not_after::text,
                refreshed_at::text,
                user_agent, ip
            FROM auth.sessions
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3`,
            [user_id, limit, offset]
        );

        if ('error' in result) {
            throw new Error(`Failed to list sessions: ${result.error.message}`);
        }

        return {
            success: true,
            sessions: result as any[],
            total,
            user_id,
        };
    },
};
