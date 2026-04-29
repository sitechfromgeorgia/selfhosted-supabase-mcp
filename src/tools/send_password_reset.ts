/**
 * send_password_reset — Triggers a password reset email for a user.
 *
 * Uses Supabase Auth API (service_role).
 * Privileged tool.
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';

const SendPasswordResetInputSchema = z.object({
    email: z.string().email().describe('Email address of the user'),
    redirect_to: z.string().optional().describe('URL to redirect after password reset'),
    dry_run: z.boolean().optional().default(false),
});

type SendPasswordResetInput = z.infer<typeof SendPasswordResetInputSchema>;

const SendPasswordResetOutputSchema = z.object({
    success: z.boolean(),
    message: z.string(),
    email: z.string(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        email: { type: 'string' },
        redirect_to: { type: 'string' },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['email'],
};

export const sendPasswordResetTool = {
    name: 'send_password_reset',
    description: 'Sends a password reset email to a user.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: SendPasswordResetInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: SendPasswordResetOutputSchema,

    execute: async (input: SendPasswordResetInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { email, redirect_to, dry_run } = input;

        const srClient = client.getServiceRoleClient();
        if (!srClient) {
            throw new Error('Service role key is required to send password reset emails.');
        }

        if (dry_run) {
            return {
                success: true,
                message: `DRY RUN: Would send password reset email to ${email}.`,
                email,
            };
        }

        context.log(`Sending password reset to ${email}...`, 'info');

        const options: Record<string, unknown> = {};
        if (redirect_to) options.redirectTo = redirect_to;

        const { data, error } = await srClient.auth.resetPasswordForEmail(email, options);

        if (error) {
            throw new Error(`Failed to send password reset: ${error.message}`);
        }

        return {
            success: true,
            message: `Password reset email sent to ${email}.`,
            email,
        };
    },
};
