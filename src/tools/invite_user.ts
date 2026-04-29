/**
 * invite_user — Sends a magic link invitation to a new user.
 *
 * Uses Supabase Auth API (service_role).
 * Privileged tool.
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';

const InviteUserInputSchema = z.object({
    email: z.string().email().describe('Email address to invite'),
    redirect_to: z.string().optional().describe('URL to redirect after sign-up'),
    data: z.record(z.any()).optional().describe('Additional user metadata'),
    dry_run: z.boolean().optional().default(false),
});

type InviteUserInput = z.infer<typeof InviteUserInputSchema>;

const InviteUserOutputSchema = z.object({
    success: z.boolean(),
    message: z.string(),
    email: z.string(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        email: { type: 'string' },
        redirect_to: { type: 'string' },
        data: { type: 'object' },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['email'],
};

export const inviteUserTool = {
    name: 'invite_user',
    description: 'Sends a magic link invitation to a new user email address.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: InviteUserInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: InviteUserOutputSchema,

    execute: async (input: InviteUserInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { email, redirect_to, data, dry_run } = input;

        const srClient = client.getServiceRoleClient();
        if (!srClient) {
            throw new Error('Service role key is required to invite users.');
        }

        if (dry_run) {
            return {
                success: true,
                message: `DRY RUN: Would send invitation to ${email}.`,
                email,
            };
        }

        context.log(`Sending invitation to ${email}...`, 'info');

        const options: Record<string, unknown> = {};
        if (redirect_to) options.redirectTo = redirect_to;
        if (data) options.data = data;

        const { data: inviteData, error } = await srClient.auth.inviteUserByEmail(email, options);

        if (error) {
            throw new Error(`Failed to invite user: ${error.message}`);
        }

        return {
            success: true,
            message: `Invitation sent to ${email}. User ID: ${inviteData?.user?.id || 'N/A'}`,
            email,
        };
    },
};
