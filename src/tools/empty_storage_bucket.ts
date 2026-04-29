/**
 * empty_storage_bucket — Deletes ALL objects from a bucket (keeps the bucket).
 *
 * Safety Features:
 * - Explicit confirmation via dry_run + warning
 * - Privileged tool
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';

const EmptyStorageBucketInputSchema = z.object({
    bucket: z.string().describe('Bucket name to empty'),
    dry_run: z.boolean().optional().default(false),
});

type EmptyStorageBucketInput = z.infer<typeof EmptyStorageBucketInputSchema>;

const EmptyStorageBucketOutputSchema = z.object({
    success: z.boolean(),
    message: z.string(),
    warning: z.string().optional(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        bucket: { type: 'string' },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['bucket'],
};

export const emptyStorageBucketTool = {
    name: 'empty_storage_bucket',
    description: 'Deletes ALL objects from a storage bucket while keeping the bucket itself. This cannot be undone.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: EmptyStorageBucketInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: EmptyStorageBucketOutputSchema,

    execute: async (input: EmptyStorageBucketInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { bucket, dry_run } = input;

        const srClient = client.getServiceRoleClient();
        if (!srClient) {
            throw new Error('Service role key is required for emptying buckets.');
        }

        if (dry_run) {
            return {
                success: true,
                message: `DRY RUN: Would delete all objects from bucket "${bucket}".`,
                warning: '⚠️ This would permanently delete all files in the bucket.',
            };
        }

        context.log(`Emptying bucket "${bucket}"...`, 'info');

        const { data, error } = await srClient.storage.emptyBucket(bucket);

        if (error) {
            throw new Error(`Failed to empty bucket: ${error.message}`);
        }

        return {
            success: true,
            message: `Bucket "${bucket}" emptied successfully. All objects deleted.`,
            warning: 'All objects in the bucket were permanently deleted.',
        };
    },
};
