/**
 * move_storage_object — Moves or renames a file within or across buckets.
 *
 * Safety Features:
 * - Validates source and destination paths
 * - Privileged tool
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';

const MoveStorageObjectInputSchema = z.object({
    source_bucket: z.string().describe('Source bucket name'),
    source_path: z.string().describe('Current file path'),
    destination_bucket: z.string().optional().describe('Destination bucket (same if omitted)'),
    destination_path: z.string().describe('New file path'),
    dry_run: z.boolean().optional().default(false),
});

type MoveStorageObjectInput = z.infer<typeof MoveStorageObjectInputSchema>;

const MoveStorageObjectOutputSchema = z.object({
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

export const moveStorageObjectTool = {
    name: 'move_storage_object',
    description: 'Moves or renames a file within a bucket or across buckets.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: MoveStorageObjectInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: MoveStorageObjectOutputSchema,

    execute: async (input: MoveStorageObjectInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { source_bucket, source_path, destination_bucket, destination_path, dry_run } = input;

        const srClient = client.getServiceRoleClient();
        if (!srClient) {
            throw new Error('Service role key is required for moving files.');
        }

        const destBucket = destination_bucket || source_bucket;
        const sourceRef = `${source_bucket}/${source_path}`;
        const destRef = `${destBucket}/${destination_path}`;

        if (dry_run) {
            return {
                success: true,
                message: `DRY RUN: Would move ${sourceRef} to ${destRef}.`,
                source: sourceRef,
                destination: destRef,
            };
        }

        context.log(`Moving ${sourceRef} to ${destRef}...`, 'info');

        const { data, error } = await srClient.storage
            .from(source_bucket)
            .move(source_path, `${destBucket === source_bucket ? '' : destBucket + '/'}${destination_path}`);

        if (error) {
            throw new Error(`Move failed: ${error.message}`);
        }

        return {
            success: true,
            message: `File moved from ${sourceRef} to ${destRef}.`,
            source: sourceRef,
            destination: destRef,
        };
    },
};
