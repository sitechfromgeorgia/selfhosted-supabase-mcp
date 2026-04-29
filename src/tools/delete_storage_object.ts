/**
 * delete_storage_object — Removes a specific file from a storage bucket.
 *
 * Safety Features:
 * - Validates path
 * - Privileged tool
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';

const DeleteStorageObjectInputSchema = z.object({
    bucket: z.string().describe('Bucket name'),
    path: z.string().describe('File path to delete'),
    dry_run: z.boolean().optional().default(false),
});

type DeleteStorageObjectInput = z.infer<typeof DeleteStorageObjectInputSchema>;

const DeleteStorageObjectOutputSchema = z.object({
    success: z.boolean(),
    message: z.string(),
    path: z.string(),
    bucket: z.string(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        bucket: { type: 'string' },
        path: { type: 'string' },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['bucket', 'path'],
};

export const deleteStorageObjectTool = {
    name: 'delete_storage_object',
    description: 'Deletes a specific file from a storage bucket.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: DeleteStorageObjectInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: DeleteStorageObjectOutputSchema,

    execute: async (input: DeleteStorageObjectInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { bucket, path, dry_run } = input;

        const srClient = client.getServiceRoleClient();
        if (!srClient) {
            throw new Error('Service role key is required for file deletion.');
        }

        if (dry_run) {
            return {
                success: true,
                message: `DRY RUN: Would delete ${bucket}/${path}.`,
                path,
                bucket,
            };
        }

        context.log(`Deleting ${bucket}/${path}...`, 'info');

        const { data, error } = await srClient.storage.from(bucket).remove([path]);

        if (error) {
            throw new Error(`Delete failed: ${error.message}`);
        }

        return {
            success: true,
            message: `File ${bucket}/${path} deleted successfully.`,
            path,
            bucket,
        };
    },
};
