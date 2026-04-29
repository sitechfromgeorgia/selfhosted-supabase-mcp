/**
 * create_signed_url — Generates a time-limited signed URL for a storage object.
 *
 * Safety Features:
 * - Max expiry limited to 7 days (604800 seconds)
 * - Privileged tool
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';

const CreateSignedUrlInputSchema = z.object({
    bucket: z.string().describe('Bucket name'),
    path: z.string().describe('File path'),
    expiry_seconds: z.number().int().min(1).max(604800).optional().default(3600).describe('URL expiry in seconds (max 7 days)'),
    download: z.boolean().optional().default(false).describe('Force download via Content-Disposition'),
    transform: z.object({
        width: z.number().optional(),
        height: z.number().optional(),
        quality: z.number().min(1).max(100).optional(),
        format: z.enum(['auto', 'avif', 'webp', 'origin']).optional().default('auto'),
    }).optional().describe('Image transformation options'),
    dry_run: z.boolean().optional().default(false),
});

type CreateSignedUrlInput = z.infer<typeof CreateSignedUrlInputSchema>;

const CreateSignedUrlOutputSchema = z.object({
    success: z.boolean(),
    signed_url: z.string(),
    expires_at: z.string(),
    path: z.string(),
    bucket: z.string(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        bucket: { type: 'string' },
        path: { type: 'string' },
        expiry_seconds: { type: 'number', default: 3600 },
        download: { type: 'boolean', default: false },
        transform: {
            type: 'object',
            properties: {
                width: { type: 'number' },
                height: { type: 'number' },
                quality: { type: 'number' },
                format: { type: 'string', enum: ['auto', 'avif', 'webp', 'origin'] },
            },
        },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['bucket', 'path'],
};

export const createSignedUrlTool = {
    name: 'create_signed_url',
    description: 'Creates a time-limited signed URL for a storage object. Supports image transformations.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: CreateSignedUrlInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: CreateSignedUrlOutputSchema,

    execute: async (input: CreateSignedUrlInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { bucket, path, expiry_seconds, download, transform, dry_run } = input;

        const srClient = client.getServiceRoleClient();
        if (!srClient) {
            throw new Error('Service role key is required for creating signed URLs.');
        }

        const expiresAt = new Date(Date.now() + expiry_seconds * 1000);

        if (dry_run) {
            return {
                success: true,
                signed_url: `DRY RUN: Would generate signed URL for ${bucket}/${path} expiring at ${expiresAt.toISOString()}`,
                expires_at: expiresAt.toISOString(),
                path,
                bucket,
            };
        }

        context.log(`Creating signed URL for ${bucket}/${path} (expires in ${expiry_seconds}s)...`, 'info');

        const options: Record<string, unknown> = {};
        if (download) options.download = download;
        if (transform) options.transform = transform;

        const { data, error } = await srClient.storage
            .from(bucket)
            .createSignedUrl(path, expiry_seconds, options);

        if (error) {
            throw new Error(`Failed to create signed URL: ${error.message}`);
        }

        if (!data?.signedUrl) {
            throw new Error('Signed URL generation returned empty result.');
        }

        return {
            success: true,
            signed_url: data.signedUrl,
            expires_at: expiresAt.toISOString(),
            path,
            bucket,
        };
    },
};
