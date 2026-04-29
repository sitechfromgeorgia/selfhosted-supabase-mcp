import { z } from 'zod';

import type { ToolContext } from './types.js';
import { handleSqlResponse } from './utils.js';
import type { SqlSuccessResponse, StorageBucket } from '../types/index.js';

// Zod schema for the bucket structure (Output Validation)
const BucketSchema = z.object({
    id: z.string(),
    name: z.string(),
    owner: z.string().nullable(),
    public: z.boolean(),
    avif_autodetection: z.boolean(),
    file_size_limit: z.number().nullable(),
    allowed_mime_types: z.array(z.string()).nullable(),
    // Keep timestamps as strings as returned by DB/pg
    created_at: z.string().nullable(),
    updated_at: z.string().nullable(),
});

const ListStorageBucketsOutputSchema = z.array(BucketSchema);
type ListStorageBucketsOutput = StorageBucket[];

// Static JSON schema for MCP
export const mcpInputSchema = {
    type: 'object',
    properties: {},
    required: [],
};

// Zod schema for runtime input validation
const inputSchema = z.object({});
type Input = z.infer<typeof inputSchema>;

// Tool definition
export const listStorageBucketsTool = {
    name: 'list_storage_buckets',
    description: 'Lists all storage buckets in the project.',
    mcpInputSchema,
    inputSchema,
    outputSchema: ListStorageBucketsOutputSchema,

    execute: async (
        input: Input,
        context: ToolContext
    ): Promise<ListStorageBucketsOutput> => {
        const client = context.selfhostedClient;
        console.error('Listing storage buckets...');

        // 1. Try Supabase Storage API (works without DATABASE_URL)
        // Use service role if available, otherwise anon client
        const apiClient = client.getServiceRoleClient() ?? client.supabase;
        const { data, error } = await apiClient.storage.listBuckets();
        if (error) {
            context.log(`Supabase Storage API failed: ${error.message}. Falling back to DB...`, 'warn');
        } else if (data) {
            console.error(`Found ${data.length} buckets via API.`);
            // Map API response to our schema (API returns slightly different shape)
            const mapped = data.map((b: any) => ({
                id: b.id,
                name: b.name,
                owner: b.owner ?? null,
                public: b.public ?? false,
                avif_autodetection: b.avif_autodetection ?? false,
                file_size_limit: b.file_size_limit ?? null,
                allowed_mime_types: b.allowed_mime_types ?? null,
                created_at: b.created_at ?? null,
                updated_at: b.updated_at ?? null,
            }));
            return ListStorageBucketsOutputSchema.parse(mapped);
        }

        // 2. Fallback to direct DB connection
        if (!client.isPgAvailable()) {
            throw new Error('Neither Supabase Storage API nor direct database connection (DATABASE_URL) is available. Cannot list storage buckets.');
        }

        const sql = `
            SELECT
                id,
                name,
                owner,
                public,
                avif_autodetection,
                file_size_limit,
                allowed_mime_types,
                created_at::text,
                updated_at::text
            FROM storage.buckets;
        `;

        console.error('Attempting to list storage buckets using direct DB connection...');
        const result = await client.executeSqlWithPg(sql);
        const validatedBuckets = handleSqlResponse(result, ListStorageBucketsOutputSchema);

        console.error(`Found ${validatedBuckets.length} buckets via DB.`);
        context.log(`Found ${validatedBuckets.length} buckets.`);
        return validatedBuckets;
    },
};

// Default export for potential dynamic loading
export default listStorageBucketsTool; 