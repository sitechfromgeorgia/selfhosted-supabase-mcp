import { z } from 'zod';
import type { PoolClient } from 'pg'; // Import PoolClient type

import type { ToolContext } from './types.js';
import { handleSqlResponse } from './utils.js';
import type { SqlSuccessResponse } from '../types/index.js'; // Import the type

// Input schema
const ListStorageObjectsInputSchema = z.object({
    bucket_id: z.string().describe('The ID of the bucket to list objects from.'),
    limit: z.number().int().positive().optional().default(100).describe('Max number of objects to return'),
    offset: z.number().int().nonnegative().optional().default(0).describe('Number of objects to skip'),
    prefix: z.string().optional().describe('Filter objects by a path prefix (e.g., \'public/\')'),
});
type ListStorageObjectsInput = z.infer<typeof ListStorageObjectsInputSchema>;

// Output schema
const StorageObjectSchema = z.object({
    id: z.string().uuid(),
    name: z.string().nullable(), // Name can be null according to schema
    bucket_id: z.string(),
    owner: z.string().uuid().nullable(),
    version: z.string().nullable(),
    // Get mimetype directly from SQL extraction
    mimetype: z.string().nullable(),
    // size comes from metadata - use transform instead of pipe for Zod v4
    size: z.union([z.string(), z.number(), z.null()]).transform((val) => {
        if (val === null) return null;
        const num = typeof val === 'number' ? val : parseInt(String(val), 10);
        return isNaN(num) ? null : num;
    }),
    // Keep raw metadata as well
    metadata: z.record(z.string(), z.any()).nullable(),
    created_at: z.string().nullable(),
    updated_at: z.string().nullable(),
    last_accessed_at: z.string().nullable(),
});
const ListStorageObjectsOutputSchema = z.array(StorageObjectSchema);
type ListStorageObjectsOutput = z.infer<typeof ListStorageObjectsOutputSchema>;

// Static JSON schema for MCP
export const mcpInputSchema = {
    type: 'object',
    properties: {
        bucket_id: { type: 'string', description: 'The ID of the bucket to list objects from.' },
        limit: { type: 'number', description: 'Max number of objects to return', default: 100 },
        offset: { type: 'number', description: 'Number of objects to skip', default: 0 },
        prefix: { type: 'string', description: "Filter objects by a path prefix (e.g., 'public/')" },
    },
    required: ['bucket_id'],
};

// Tool definition
export const listStorageObjectsTool = {
    name: 'list_storage_objects',
    description: 'Lists objects within a specific storage bucket, optionally filtering by prefix.',
    mcpInputSchema,
    inputSchema: ListStorageObjectsInputSchema,
    outputSchema: ListStorageObjectsOutputSchema,

    execute: async (
        input: ListStorageObjectsInput,
        context: ToolContext
    ): Promise<ListStorageObjectsOutput> => {
        const client = context.selfhostedClient;
        const { bucket_id, limit, offset, prefix } = input;

        console.error(`Listing objects for bucket ${bucket_id} (Prefix: ${prefix || 'N/A'})...`);

        // 1. Try Supabase Storage API (works without DATABASE_URL)
        const apiClient = client.getServiceRoleClient() ?? client.supabase;
        const { data, error } = await apiClient.storage.from(bucket_id).list(prefix || undefined, { limit, offset });
        if (error) {
            context.log(`Supabase Storage API failed: ${error.message}. Falling back to DB...`, 'warn');
        } else if (data) {
            console.error(`Found ${data.length} objects via API.`);
            // Map API response to our schema
            const mapped = data.map((item: any) => ({
                id: item.id ?? '',
                name: item.name ?? null,
                bucket_id,
                owner: null,
                version: null,
                mimetype: item.metadata?.mimetype ?? null,
                size: item.metadata?.size ?? null,
                metadata: item.metadata ?? null,
                created_at: item.created_at ?? null,
                updated_at: item.updated_at ?? null,
                last_accessed_at: null,
            }));
            return ListStorageObjectsOutputSchema.parse(mapped);
        }

        // 2. Fallback to direct DB
        if (!client.isPgAvailable()) {
            throw new Error('Neither Supabase Storage API nor direct database connection (DATABASE_URL) is available. Cannot list storage objects.');
        }

        const objects = await client.executeTransactionWithPg(async (pgClient: PoolClient) => {
            let sql = `
                SELECT
                    id, name, bucket_id, owner, version,
                    metadata ->> 'mimetype' AS mimetype,
                    metadata ->> 'size' AS size,
                    metadata,
                    created_at::text, updated_at::text, last_accessed_at::text
                FROM storage.objects
                WHERE bucket_id = $1
            `;
            const params: (string | number)[] = [bucket_id];
            let paramIndex = 2;
            if (prefix) { sql += ` AND name LIKE $${paramIndex++}`; params.push(`${prefix}%}`); }
            sql += ' ORDER BY name ASC NULLS FIRST';
            sql += ` LIMIT $${paramIndex++}`; params.push(limit);
            sql += ` OFFSET $${paramIndex++}`; params.push(offset);
            sql += ';';

            const result = await pgClient.query(sql, params);
            return handleSqlResponse(result.rows as SqlSuccessResponse, ListStorageObjectsOutputSchema);
        });

        console.error(`Found ${objects.length} objects via DB.`);
        context.log(`Found ${objects.length} objects.`);
        return objects;
    },
};

export default listStorageObjectsTool; 