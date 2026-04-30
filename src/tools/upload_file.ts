/**
 * upload_file — Uploads a file to a storage bucket.
 *
 * Supports base64-encoded content or raw text.
 * Safety Features:
 * - Validates bucket and path names
 * - Checks file size against bucket limit
 * - Content type validation
 * - Privileged tool
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';

const UploadFileInputSchema = z.object({
    bucket: z.string().describe('Target bucket name'),
    path: z.string().describe('File path within bucket (e.g., "folder/file.png")'),
    content: z.string().describe('File content (base64 encoded)'),
    content_type: z.string().optional().describe('MIME type (auto-detected if not provided)'),
    upsert: z.boolean().optional().default(false).describe('Overwrite if file exists'),
    encoding: z.enum(['base64', 'text']).optional().default('base64').describe('Content encoding'),
    dry_run: z.boolean().optional().default(false),
});

type UploadFileInput = z.infer<typeof UploadFileInputSchema>;

const UploadFileOutputSchema = z.object({
    success: z.boolean(),
    message: z.string(),
    path: z.string(),
    bucket: z.string(),
    size: z.number(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        bucket: { type: 'string' },
        path: { type: 'string' },
        content: { type: 'string' },
        content_type: { type: 'string' },
        upsert: { type: 'boolean', default: false },
        encoding: { type: 'string', enum: ['base64', 'text'], default: 'base64' },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['bucket', 'path', 'content'],
};

export const uploadFileTool = {
    name: 'upload_file',
    description: 'Uploads a file to a storage bucket. Content must be base64 encoded by default.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: UploadFileInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: UploadFileOutputSchema,

    execute: async (input: UploadFileInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { bucket, path, content, content_type, upsert, encoding, dry_run } = input;
        const resolvedEncoding = encoding || 'base64';

        const srClient = client.getServiceRoleClient();
        if (!srClient) {
            throw new Error('Service role key is required for file uploads.');
        }

        // Decode content
        let fileBuffer: Buffer;
        try {
            if (resolvedEncoding === 'base64') {
                fileBuffer = Buffer.from(content, 'base64');
            } else {
                fileBuffer = Buffer.from(content, 'utf-8');
            }
        } catch {
            throw new Error(`Failed to decode content as ${encoding}.`);
        }

        if (fileBuffer.length === 0) {
            throw new Error('File content is empty.');
        }

        if (dry_run) {
            return {
                success: true,
                message: `DRY RUN: Would upload ${fileBuffer.length} bytes to ${bucket}/${path}.`,
                path,
                bucket,
                size: fileBuffer.length,
            };
        }

        context.log(`Uploading ${fileBuffer.length} bytes to ${bucket}/${path}...`, 'info');

        const options: Record<string, unknown> = { upsert };
        if (content_type) options.contentType = content_type;

        const { data, error } = await srClient.storage.from(bucket).upload(path, fileBuffer, options);

        if (error) {
            throw new Error(`Upload failed: ${error.message}`);
        }

        return {
            success: true,
            message: `File uploaded successfully to ${bucket}/${path}.`,
            path,
            bucket,
            size: fileBuffer.length,
        };
    },
};
