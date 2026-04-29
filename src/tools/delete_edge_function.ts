/**
 * delete_edge_function — Removes an Edge Function registration.
 *
 * NOTE: Code removal from storage requires Supabase CLI in self-hosted environments.
 * Privileged tool.
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';

const DeleteEdgeFunctionInputSchema = z.object({
    slug: z.string().describe('Function slug to delete'),
    dry_run: z.boolean().optional().default(false),
});

type DeleteEdgeFunctionInput = z.infer<typeof DeleteEdgeFunctionInputSchema>;

const DeleteEdgeFunctionOutputSchema = z.object({
    success: z.boolean(),
    message: z.string(),
    warning: z.string().optional(),
    slug: z.string(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        slug: { type: 'string' },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['slug'],
};

export const deleteEdgeFunctionTool = {
    name: 'delete_edge_function',
    description: 'Deletes an Edge Function registration. Code files may remain in storage until cleaned up via CLI.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: DeleteEdgeFunctionInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: DeleteEdgeFunctionOutputSchema,

    execute: async (input: DeleteEdgeFunctionInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { slug, dry_run } = input;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        if (dry_run) {
            return {
                success: true,
                message: `DRY RUN: Would delete edge function "${slug}".`,
                warning: 'Code files in storage may remain until cleaned up.',
                slug,
            };
        }

        context.log(`Deleting edge function "${slug}"...`, 'info');

        const result = await client.executeSqlWithPg(
            'DELETE FROM supabase_functions.functions WHERE slug = $1 RETURNING id',
            [slug]
        );

        if ('error' in result) {
            throw new Error(`Failed to delete function: ${result.error.message}`);
        }

        const rows = result as any[];
        if (rows.length === 0) {
            throw new Error(`Function "${slug}" not found.`);
        }

        return {
            success: true,
            message: `Edge function "${slug}" deleted successfully.`,
            warning: 'Code files may remain in storage. Run `supabase functions delete ' + slug + '` to clean up fully.',
            slug,
        };
    },
};
