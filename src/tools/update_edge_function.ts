/**
 * update_edge_function — Updates Edge Function metadata.
 *
 * NOTE: Code updates require Supabase CLI in self-hosted environments.
 * Privileged tool.
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';

const UpdateEdgeFunctionInputSchema = z.object({
    slug: z.string().describe('Function slug to update'),
    name: z.string().optional().describe('New function name'),
    verify_jwt: z.boolean().optional().describe('Update JWT verification setting'),
    import_map: z.boolean().optional().describe('Update import map setting'),
    dry_run: z.boolean().optional().default(false),
});

type UpdateEdgeFunctionInput = z.infer<typeof UpdateEdgeFunctionInputSchema>;

const UpdateEdgeFunctionOutputSchema = z.object({
    success: z.boolean(),
    message: z.string(),
    note: z.string(),
    slug: z.string(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        slug: { type: 'string' },
        name: { type: 'string' },
        verify_jwt: { type: 'boolean' },
        import_map: { type: 'boolean' },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['slug'],
};

export const updateEdgeFunctionTool = {
    name: 'update_edge_function',
    description: 'Updates Edge Function metadata (name, JWT verification, import map). Code updates require CLI.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: UpdateEdgeFunctionInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: UpdateEdgeFunctionOutputSchema,

    execute: async (input: UpdateEdgeFunctionInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { slug, name, verify_jwt, import_map, dry_run } = input;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        const note = 'NOTE: This tool only updates metadata. To update code, run: supabase functions deploy ' + slug;

        const sets: string[] = ['updated_at = now()'];
        const params: any[] = [];
        let idx = 1;

        if (name !== undefined) { sets.push(`name = $${idx++}`); params.push(name); }
        if (verify_jwt !== undefined) { sets.push(`verify_jwt = $${idx++}`); params.push(verify_jwt); }
        if (import_map !== undefined) { sets.push(`import_map = $${idx++}`); params.push(import_map); }

        if (sets.length === 1) {
            return {
                success: true,
                message: 'No fields to update.',
                note,
                slug,
            };
        }

        params.push(slug);

        if (dry_run) {
            return {
                success: true,
                message: `DRY RUN: Would update edge function "${slug}".`,
                note,
                slug,
            };
        }

        context.log(`Updating edge function "${slug}"...`, 'info');

        const sql = `UPDATE supabase_functions.functions SET ${sets.join(', ')} WHERE slug = $${idx} RETURNING id`;
        const result = await client.executeSqlWithPg(sql, params);

        if ('error' in result) {
            throw new Error(`Failed to update function: ${result.error.message}`);
        }

        const rows = result as any[];
        if (rows.length === 0) {
            throw new Error(`Function "${slug}" not found.`);
        }

        return {
            success: true,
            message: `Edge function "${slug}" updated successfully.`,
            note,
            slug,
        };
    },
};
