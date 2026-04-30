/**
 * get_auth_settings — Retrieves auth configuration (MFA, providers, email templates).
 *
 * Reads auth.config and auth.identities via pg.
 * Regular tool.
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';

const GetAuthSettingsInputSchema = z.object({});

type GetAuthSettingsInput = z.infer<typeof GetAuthSettingsInputSchema>;

const GetAuthSettingsOutputSchema = z.object({
    success: z.boolean(),
    settings: z.record(z.string(), z.any()),
});

const mcpInputSchema = {
    type: 'object',
    properties: {},
    required: [],
};

export const getAuthSettingsTool = {
    name: 'get_auth_settings',
    description: 'Retrieves auth configuration: MFA settings, email providers, external OAuth providers, email templates.',
    privilegeLevel: 'regular' as ToolPrivilegeLevel,
    inputSchema: GetAuthSettingsInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: GetAuthSettingsOutputSchema,

    execute: async (input: GetAuthSettingsInput, context: ToolContext) => {
        const client = context.selfhostedClient;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        context.log('Fetching auth settings...', 'info');

        // Supabase stores auth settings in various places
        // 1. auth.config table (if exists)
        // 2. Gotrue config via environment variables (not in DB)
        // 3. MFA settings in auth.mfa_factors, auth.mfa_challenges

        const settings: Record<string, unknown> = {};

        // Check MFA availability
        try {
            const mfaResult = await client.executeSqlWithPg(
                `SELECT COUNT(*) as count FROM auth.mfa_factors LIMIT 1`
            );
            if (!('error' in mfaResult)) {
                settings.mfa_enabled = true;
            }
        } catch {
            settings.mfa_enabled = false;
        }

        // Get identity providers
        try {
            const providersResult = await client.executeSqlWithPg(
                `SELECT DISTINCT provider FROM auth.identities LIMIT 20`
            );
            if (!('error' in providersResult)) {
                settings.active_providers = (providersResult as any[]).map((r) => r.provider);
            }
        } catch {
            settings.active_providers = [];
        }

        // Email confirmation settings from auth.users stats
        try {
            const emailResult = await client.executeSqlWithPg(
                `SELECT
                    COUNT(*) FILTER (WHERE email_confirmed_at IS NOT NULL) as confirmed,
                    COUNT(*) FILTER (WHERE email_confirmed_at IS NULL) as unconfirmed,
                    COUNT(*) as total
                FROM auth.users`
            );
            if (!('error' in emailResult)) {
                settings.email_confirmation_stats = (emailResult as any[])[0];
            }
        } catch {
            // ignore
        }

        return {
            success: true,
            settings,
        };
    },
};
