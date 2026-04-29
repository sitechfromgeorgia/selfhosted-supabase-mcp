/**
 * get_storage_object_metadata — Retrieves metadata for a storage object.
 *
 * Returns: size, MIME type, last modified, cache control, etc.
 * Regular tool (read-only).
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';

const GetStorageObjectMetadataInputSchema = z.object({
    bucket: z.string().describe('Bucket name'),
    path: z.string().describe('File path'),
});

type GetStorageObjectMetadataInput = z.infer<typeof GetStorageObjectMetadataInputSchema>;

const GetStorageObjectMetadataOutputSchema = z.object({
    success: z.boolean(),
    name: z.string(),
    bucket_id: z.string(),
    size: z.number(),
    mimetype: z.string().nullable(),
    cache_control: z.string().nullable(),
    created_at: z.string().nullable(),
    updated_at: z.string().nullable(),
    last_accessed_at: z.string().nullable(),
    metadata: z.record(z.any()).nullable(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        bucket: { type: 'string' },
        path: { type: 'string' },
    },
    required: ['bucket', 'path'],
};

export const getStorageObjectMetadataTool = {
    name: 'get_storage_object_metadata',
    description: 'Retrieves metadata (size, MIME type, timestamps) for a storage object.',
    privilegeLevel: 'regular' as ToolPrivilegeLevel,
    inputSchema: GetStorageObjectMetadataInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: GetStorageObjectMetadataOutputSchema,

    execute: async (input: GetStorageObjectMetadataInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { bucket, path } = input;

        const sbClient = client.getServiceRoleClient() || client.supabase;
        if (!sbClient) {
            throw new Error('Supabase client is not available.');
        }

        context.log(`Getting metadata for ${bucket}/${path}...`, 'info');

        // Use list with limit 1 and exact match to get metadata
        const { data, error } = await sbClient.storage.from(bucket).list(
            path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '',
            {
                limit: 1,
                offset: 0,
                search: path.includes('/') ? path.substring(path.lastIndexOf('/') + 1) : path,
            }
        );

        if (error) {
            throw new Error(`Failed to get metadata: ${error.message}`);
        }

        if (!data || data.length === 0) {
            throw new Error(`Object ${bucket}/${path} not found.`);
        }

        const obj = data[0];

        return {
            success: true,
            name: obj.name,
            bucket_id: bucket,
            size: obj.metadata?.size || 0,
            mimetype: obj.metadata?.mimetype || null,
            cache_control: obj.metadata?.cacheControl || null,
            created_at: obj.created_at || null,
            updated_at: obj.updated_at || null,
            last_accessed_at: obj.last_accessed_at || null,
            metadata: obj.metadata || null,
        };
    },
};
