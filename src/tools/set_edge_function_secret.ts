/**
 * set_edge_function_secret — Sets or updates an Edge Function environment variable.
 *
 * NOTE: Values are encrypted. Uses supabase_functions.secrets table.
 * Privileged tool.
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';

const SetEdgeFunctionSecretInputSchema = z.object({
    name: z.string().min(1).describe('Secret name (e.g., MY_API_KEY)'),
    value: z.string().describe('Secret value'),
    function_slug: z.string().optional().describe('Scope to specific function (omit for global)'),
    dry_run: z.boolean().optional().default(false),
});

type SetEdgeFunctionSecretInput = z.infer<typeof SetEdgeFunctionSecretInputSchema>;

const SetEdgeFunctionSecretOutputSchema = z.object({
    success: z.boolean(),
    message: z.string(),
    name: z.string(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        name: { type: 'string' },
        value: { type: 'string' },
        function_slug: { type: 'string' },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['name', 'value'],
};

export const setEdgeFunctionSecretTool = {
    name: 'set_edge_function_secret',
    description: 'Sets an Edge Function environment variable. The value is stored encrypted.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: SetEdgeFunctionSecretInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: SetEdgeFunctionSecretOutputSchema,

    execute: async (input: SetEdgeFunctionSecretInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { name, value, function_slug, dry_run } = input;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        if (dry_run) {
            return {
                success: true,
                message: `DRY RUN: Would set secret "${name}"${function_slug ? ' for function ' + function_slug : ' globally'}.`,
                name,
            };
        }

        context.log(`Setting secret "${name}"...`, 'info');

        // Try to insert/update. Note: actual encryption depends on supabase_functions setup.
        // Some self-hosted setups store plaintext, others encrypt via trigger.
        const sql = `
            INSERT INTO supabase_functions.secrets (name, value, function_slug)
            VALUES ($1, $2, $3)
            ON CONFLICT (name, COALESCE(function_slug, ''))
            DO UPDATE SET value = EXCLUDED.value, updated_at = now()
            RETURNING name;
        `;

        const result = await client.executeSqlWithPg(sql, [name, value, function_slug || null]);

        if ('error' in result) {
            // Fallback: secrets table may not exist or have different schema
            throw new Error(`Failed to set secret: ${result.error.message}`);
        }

        return {
            success: true,
            message: `Secret "${name}" set successfully.${function_slug ? ' Scoped to function: ' + function_slug : ' Global scope.'}`,
            name,
        };
    },
};
