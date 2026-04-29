/**
 * update_auth_settings — Updates auth configuration.
 *
 * Currently supports updating site_url and additional_redirect_urls in auth.config.
 * Privileged tool.
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';

const UpdateAuthSettingsInputSchema = z.object({
    site_url: z.string().url().optional().describe('Default site URL for redirects'),
    additional_redirect_urls: z.array(z.string()).optional().describe('Allowed redirect URLs'),
    dry_run: z.boolean().optional().default(false),
});

type UpdateAuthSettingsInput = z.infer<typeof UpdateAuthSettingsInputSchema>;

const UpdateAuthSettingsOutputSchema = z.object({
    success: z.boolean(),
    message: z.string(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        site_url: { type: 'string' },
        additional_redirect_urls: { type: 'array', items: { type: 'string' } },
        dry_run: { type: 'boolean', default: false },
    },
    required: [],
};

export const updateAuthSettingsTool = {
    name: 'update_auth_settings',
    description: 'Updates auth configuration: site URL, allowed redirect URLs. Note: Most auth settings require environment variable changes.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: UpdateAuthSettingsInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: UpdateAuthSettingsOutputSchema,

    execute: async (input: UpdateAuthSettingsInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { site_url, additional_redirect_urls, dry_run } = input;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        if (dry_run) {
            return {
                success: true,
                message: `DRY RUN: Would update auth settings.${site_url ? ' site_url=' + site_url : ''}${additional_redirect_urls ? ' additional_redirect_urls=' + additional_redirect_urls.join(', ') : ''}`,
            };
        }

        context.log('Updating auth settings...', 'info');

        // Note: In self-hosted Supabase, many auth settings are configured via
        // environment variables (GOTRUE_SITE_URL, etc.) and not stored in the DB.
        // We can only update settings that are stored in auth.config if the table exists.

        const updates: string[] = [];
        const params: any[] = [];
        let idx = 1;

        if (site_url !== undefined) {
            updates.push(`site_url = $${idx++}`);
            params.push(site_url);
        }
        if (additional_redirect_urls !== undefined) {
            updates.push(`additional_redirect_urls = $${idx++}::text[]`);
            params.push(additional_redirect_urls);
        }

        if (updates.length === 0) {
            return {
                success: true,
                message: 'No settings to update. Note: Most auth settings require environment variable changes in self-hosted Supabase.',
            };
        }

        // Try to update auth.config if it exists
        try {
            const result = await client.executeSqlWithPg(
                `UPDATE auth.config SET ${updates.join(', ')} RETURNING id`,
                params
            );

            if ('error' in result) {
                throw new Error(result.error.message);
            }

            return {
                success: true,
                message: `Auth settings updated successfully.${site_url ? ' Site URL: ' + site_url : ''}`,
            };
        } catch (err: any) {
            // auth.config may not exist in all self-hosted setups
            return {
                success: false,
                message: `Could not update auth settings: ${err.message}. Most auth settings require environment variable changes (e.g., GOTRUE_SITE_URL).`,
            };
        }
    },
};
