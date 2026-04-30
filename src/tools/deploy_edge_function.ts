/**
 * deploy_edge_function — Deploys an Edge Function.
 *
 * NOTE: Self-hosted Supabase requires the Supabase CLI for full deployment
 * (building Deno bundle + uploading to storage). This tool registers the
 * function metadata in the database. Actual code deployment requires CLI.
 * Privileged tool.
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';
import { validateIdentifiers, quoteIdentifier } from './ddl-utils.js';

const DeployEdgeFunctionInputSchema = z.object({
    name: z.string().describe('Function name (slug)'),
    slug: z.string().describe('URL-friendly function identifier'),
    verify_jwt: z.boolean().optional().default(true).describe('Require JWT verification'),
    import_map: z.boolean().optional().default(false).describe('Use import map'),
    dry_run: z.boolean().optional().default(false),
});

type DeployEdgeFunctionInput = z.infer<typeof DeployEdgeFunctionInputSchema>;

const DeployEdgeFunctionOutputSchema = z.object({
    success: z.boolean(),
    message: z.string(),
    note: z.string(),
    function_name: z.string(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        name: { type: 'string' },
        slug: { type: 'string' },
        verify_jwt: { type: 'boolean', default: true },
        import_map: { type: 'boolean', default: false },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['name', 'slug'],
};

export const deployEdgeFunctionTool = {
    name: 'deploy_edge_function',
    description: 'Registers an Edge Function in the database. NOTE: Actual code deployment requires Supabase CLI in self-hosted environments.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: DeployEdgeFunctionInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: DeployEdgeFunctionOutputSchema,

    execute: async (input: DeployEdgeFunctionInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { name, slug, verify_jwt, import_map, dry_run } = input;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        // Edge function names and slugs allow hyphens (URL-friendly)
        const slugRegex = /^[a-z0-9._-]+$/i;
        if (!slugRegex.test(name)) {
            throw new Error(`Invalid function name "${name}". Use only a-z, 0-9, ., _, and -.`);
        }
        if (!slugRegex.test(slug)) {
            throw new Error(`Invalid function slug "${slug}". Use only a-z, 0-9, ., _, and -.`);
        }

        const note = 'NOTE: This tool only registers metadata. To fully deploy using Supabase CLI, run: supabase functions deploy ' + slug;

        if (dry_run) {
            return {
                success: true,
                message: `DRY RUN: Would register edge function "${name}" (slug: ${slug}).`,
                note,
                function_name: name,
            };
        }

        context.log(`Registering edge function "${name}"...`, 'info');

        const sql = `
            INSERT INTO supabase_functions.functions (name, slug, status, verify_jwt, import_map)
            VALUES ($1, $2, 'ACTIVE', $3, $4)
            ON CONFLICT (slug) DO UPDATE SET
                name = EXCLUDED.name,
                status = 'ACTIVE',
                verify_jwt = EXCLUDED.verify_jwt,
                import_map = EXCLUDED.import_map,
                updated_at = now()
            RETURNING id;
        `;

        const result = await client.executeSqlWithPg(sql, [name, slug, verify_jwt, import_map]);

        if ('error' in result) {
            throw new Error(`Failed to register function: ${result.error.message}`);
        }

        return {
            success: true,
            message: `Edge function "${name}" registered successfully.`,
            note,
            function_name: name,
        };
    },
};
