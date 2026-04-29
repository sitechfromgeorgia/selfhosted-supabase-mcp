/**
 * delete_storage_bucket — Removes a storage bucket and all its contents.
 *
 * Safety Features:
 * - Confirmation requirement (implicit via privilege level)
 * - Validates bucket name
 * - Privileged tool
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';

const DeleteStorageBucketInputSchema = z.object({
    name: z.string().describe('Bucket name to delete'),
    dry_run: z.boolean().optional().default(false),
});

type DeleteStorageBucketInput = z.infer<typeof DeleteStorageBucketInputSchema>;

const DeleteStorageBucketOutputSchema = z.object({
    success: z.boolean(),
    message: z.string(),
    warning: z.string().optional(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        name: { type: 'string' },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['name'],
};

export const deleteStorageBucketTool = {
    name: 'delete_storage_bucket',
    description: 'Deletes a storage bucket and ALL objects within it. This action cannot be undone.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: DeleteStorageBucketInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: DeleteStorageBucketOutputSchema,

    execute: async (input: DeleteStorageBucketInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { name, dry_run } = input;

        const srClient = client.getServiceRoleClient();
        if (!srClient) {
            throw new Error('Service role key is required for storage bucket deletion.');
        }

        if (dry_run) {
            return {
                success: true,
                message: `DRY RUN: Would delete bucket "${name}" and all its contents.`,
                warning: '⚠️ This action would permanently delete all files in the bucket.',
            };
        }

        context.log(`Deleting storage bucket "${name}"...`, 'info');

        const { error } = await srClient.storage.deleteBucket(name);

        if (error) {
            throw new Error(`Failed to delete bucket: ${error.message}`);
        }

        return {
            success: true,
            message: `Bucket "${name}" and all its contents deleted successfully.`,
            warning: 'All objects in the bucket were permanently deleted.',
        };
    },
};
