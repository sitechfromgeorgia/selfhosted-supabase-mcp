/**
 * list_edge_function_secrets — Lists environment variables (secrets) for Edge Functions.
 *
 * Queries supabase_functions.secrets via pg.
 * Regular tool.
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';

const ListEdgeFunctionSecretsInputSchema = z.object({
    function_slug: z.string().optional().describe('Filter by function slug (omit for all)'),
});

type ListEdgeFunctionSecretsInput = z.infer<typeof ListEdgeFunctionSecretsInputSchema>;

const SecretSchema = z.object({
    name: z.string(),
    function_slug: z.string().nullable(),
    created_at: z.string().nullable(),
});

const ListEdgeFunctionSecretsOutputSchema = z.object({
    success: z.boolean(),
    secrets: z.array(SecretSchema),
    count: z.number(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        function_slug: { type: 'string' },
    },
    required: [],
};

export const listEdgeFunctionSecretsTool = {
    name: 'list_edge_function_secrets',
    description: 'Lists Edge Function environment variables (secret names only, values are hidden).',
    privilegeLevel: 'regular' as ToolPrivilegeLevel,
    inputSchema: ListEdgeFunctionSecretsInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: ListEdgeFunctionSecretsOutputSchema,

    execute: async (input: ListEdgeFunctionSecretsInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { function_slug } = input;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        context.log('Listing edge function secrets...', 'info');

        let sql = `
            SELECT name, function_slug, created_at::text
            FROM supabase_functions.secrets
            WHERE 1=1
        `;
        const params: any[] = [];

        if (function_slug) {
            sql += ' AND function_slug = $1';
            params.push(function_slug);
        }

        sql += ' ORDER BY name;';

        const result = await client.executeSqlWithPg(sql, params);

        if ('error' in result) {
            // secrets table may not exist
            if (result.error.message.includes('does not exist')) {
                return {
                    success: true,
                    secrets: [],
                    count: 0,
                };
            }
            throw new Error(`Failed to list secrets: ${result.error.message}`);
        }

        const secrets = result as any[];

        return {
            success: true,
            secrets,
            count: secrets.length,
        };
    },
};
