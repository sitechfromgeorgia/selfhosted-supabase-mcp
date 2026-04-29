/**
 * create_storage_bucket — Creates a new storage bucket.
 *
 * Safety Features:
 * - Validates bucket name (alphanumeric, dashes, underscores)
 * - Checks for duplicate names
 * - Privileged tool (requires service_role)
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';

const CreateStorageBucketInputSchema = z.object({
    name: z.string().min(1).max(63).describe('Unique bucket name (a-z, 0-9, -, _)'),
    public: z.boolean().optional().default(false).describe('Whether objects are publicly accessible'),
    file_size_limit: z.number().optional().describe('Max file size in bytes (0 = unlimited)'),
    allowed_mime_types: z.array(z.string()).optional().describe('Allowed MIME types (empty = all)'),
    dry_run: z.boolean().optional().default(false),
});

type CreateStorageBucketInput = z.infer<typeof CreateStorageBucketInputSchema>;

const CreateStorageBucketOutputSchema = z.object({
    success: z.boolean(),
    message: z.string(),
    bucket_name: z.string(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        name: { type: 'string' },
        public: { type: 'boolean', default: false },
        file_size_limit: { type: 'number' },
        allowed_mime_types: { type: 'array', items: { type: 'string' } },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['name'],
};

export const createStorageBucketTool = {
    name: 'create_storage_bucket',
    description: 'Creates a new storage bucket with optional size limits and MIME type restrictions.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: CreateStorageBucketInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: CreateStorageBucketOutputSchema,

    execute: async (input: CreateStorageBucketInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { name, public: isPublic, file_size_limit, allowed_mime_types, dry_run } = input;

        const srClient = client.getServiceRoleClient();
        if (!srClient) {
            throw new Error('Service role key is required for storage bucket creation.');
        }

        // Validate bucket name
        const bucketNameRegex = /^[a-z0-9._-]+$/i;
        if (!bucketNameRegex.test(name)) {
            throw new Error(`Invalid bucket name "${name}". Use only a-z, 0-9, ., _, and -.`);
        }

        if (dry_run) {
            return {
                success: true,
                message: `DRY RUN: Would create bucket "${name}" (public=${isPublic}).`,
                bucket_name: name,
            };
        }

        context.log(`Creating storage bucket "${name}"...`, 'info');

        const options: Record<string, unknown> = {
            public: isPublic,
        };
        if (file_size_limit !== undefined) options.fileSizeLimit = file_size_limit;
        if (allowed_mime_types !== undefined) options.allowedMimeTypes = allowed_mime_types;

        const { data, error } = await srClient.storage.createBucket(name, options);

        if (error) {
            throw new Error(`Failed to create bucket: ${error.message}`);
        }

        return {
            success: true,
            message: `Bucket "${name}" created successfully.`,
            bucket_name: name,
        };
    },
};
