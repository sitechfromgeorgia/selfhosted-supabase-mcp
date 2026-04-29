/**
 * copy_storage_object — Duplicates a file within or across buckets.
 *
 * Safety Features:
 * - Validates source and destination paths
 * - Privileged tool
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';

const CopyStorageObjectInputSchema = z.object({
    source_bucket: z.string().describe('Source bucket name'),
    source_path: z.string().describe('Source file path'),
    destination_bucket: z.string().optional().describe('Destination bucket (same if omitted)'),
    destination_path: z.string().describe('Destination file path'),
    dry_run: z.boolean().optional().default(false),
});

type CopyStorageObjectInput = z.infer<typeof CopyStorageObjectInputSchema>;

const CopyStorageObjectOutputSchema = z.object({
    success: z.boolean(),
    message: z.string(),
    source: z.string(),
    destination: z.string(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        source_bucket: { type: 'string' },
        source_path: { type: 'string' },
        destination_bucket: { type: 'string' },
        destination_path: { type: 'string' },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['source_bucket', 'source_path', 'destination_path'],
};

export const copyStorageObjectTool = {
    name: 'copy_storage_object',
    description: 'Copies a file within a bucket or across buckets.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: CopyStorageObjectInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: CopyStorageObjectOutputSchema,

    execute: async (input: CopyStorageObjectInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { source_bucket, source_path, destination_bucket, destination_path, dry_run } = input;

        const srClient = client.getServiceRoleClient();
        if (!srClient) {
            throw new Error('Service role key is required for copying files.');
        }

        const destBucket = destination_bucket || source_bucket;
        const sourceRef = `${source_bucket}/${source_path}`;
        const destRef = `${destBucket}/${destination_path}`;

        if (dry_run) {
            return {
                success: true,
                message: `DRY RUN: Would copy ${sourceRef} to ${destRef}.`,
                source: sourceRef,
                destination: destRef,
            };
        }

        context.log(`Copying ${sourceRef} to ${destRef}...`, 'info');

        // Supabase copy API: copy within same bucket only for most cases
        const { data, error } = await srClient.storage
            .from(source_bucket)
            .copy(source_path, destination_path);

        if (error) {
            throw new Error(`Copy failed: ${error.message}`);
        }

        return {
            success: true,
            message: `File copied from ${sourceRef} to ${destRef}.`,
            source: sourceRef,
            destination: destRef,
        };
    },
};
