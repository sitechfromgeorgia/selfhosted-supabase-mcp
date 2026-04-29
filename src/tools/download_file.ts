/**
 * download_file — Retrieves a file from a storage bucket.
 *
 * Returns base64-encoded content and metadata.
 * Regular tool (read-only).
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';

const DownloadFileInputSchema = z.object({
    bucket: z.string().describe('Bucket name'),
    path: z.string().describe('File path within bucket'),
    encoding: z.enum(['base64', 'text']).optional().default('base64').describe('Output encoding'),
});

type DownloadFileInput = z.infer<typeof DownloadFileInputSchema>;

const DownloadFileOutputSchema = z.object({
    success: z.boolean(),
    content: z.string().describe('File content (base64 or text)'),
    content_type: z.string().nullable(),
    size: z.number(),
    path: z.string(),
    bucket: z.string(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        bucket: { type: 'string' },
        path: { type: 'string' },
        encoding: { type: 'string', enum: ['base64', 'text'], default: 'base64' },
    },
    required: ['bucket', 'path'],
};

export const downloadFileTool = {
    name: 'download_file',
    description: 'Downloads a file from a storage bucket. Returns base64-encoded content by default.',
    privilegeLevel: 'regular' as ToolPrivilegeLevel,
    inputSchema: DownloadFileInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: DownloadFileOutputSchema,

    execute: async (input: DownloadFileInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { bucket, path, encoding } = input;

        const sbClient = client.getServiceRoleClient() || client.supabase;
        if (!sbClient) {
            throw new Error('Supabase client is not available.');
        }

        context.log(`Downloading ${bucket}/${path}...`, 'info');

        const { data, error } = await sbClient.storage.from(bucket).download(path);

        if (error) {
            throw new Error(`Download failed: ${error.message}`);
        }

        if (!data) {
            throw new Error('File not found or empty.');
        }

        const arrayBuffer = await data.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const contentType = data.type || null;

        const content = encoding === 'base64'
            ? buffer.toString('base64')
            : buffer.toString('utf-8');

        return {
            success: true,
            content,
            content_type: contentType,
            size: buffer.length,
            path,
            bucket,
        };
    },
};
