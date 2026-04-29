import { z } from 'zod';
import type { ToolContext } from './types.js';
import { handleSqlResponse } from './utils.js';
import type { SqlSuccessResponse, AuthUser } from '../types/index.js';

// Input schema (initially no filters, add later)
const ListAuthUsersInputSchema = z.object({
    limit: z.number().int().positive().optional().default(50).describe('Max number of users to return'),
    offset: z.number().int().nonnegative().optional().default(0).describe('Number of users to skip'),
    // Add filters later (e.g., by email pattern, role)
});
type ListAuthUsersInput = z.infer<typeof ListAuthUsersInputSchema>;

// Output schema - Zod for validation
const AuthUserZodSchema = z.object({
    id: z.string().uuid(),
    email: z.string().email('Invalid email').nullable(),
    role: z.string().nullable(),
    // Timestamps returned as text from DB might not strictly be ISO 8601 / Zod datetime compliant
    created_at: z.string().nullable(),
    last_sign_in_at: z.string().nullable(),
    raw_app_meta_data: z.record(z.string(), z.unknown()).nullable(),
    raw_user_meta_data: z.record(z.string(), z.unknown()).nullable(),
    // Add more fields as needed (e.g., email_confirmed_at, phone)
});
const ListAuthUsersOutputSchema = z.array(AuthUserZodSchema);
// Use AuthUser[] for the output type hint
type ListAuthUsersOutput = AuthUser[];

// Static JSON Schema for MCP capabilities
const mcpInputSchema = {
    type: 'object',
    properties: {
        limit: {
            type: 'number',
            description: 'Max number of users to return',
            default: 50,
        },
        offset: {
            type: 'number',
            description: 'Number of users to skip',
            default: 0,
        },
    },
    required: [],
};

// Tool definition
export const listAuthUsersTool = {
    name: 'list_auth_users',
    description: 'Lists users from the auth.users table.',
    inputSchema: ListAuthUsersInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: ListAuthUsersOutputSchema,

    execute: async (input: ListAuthUsersInput, context: ToolContext): Promise<ListAuthUsersOutput> => {
        const client = context.selfhostedClient;
        const { limit, offset } = input;

        // 1. Try Supabase Admin API (works without DATABASE_URL)
        const serviceRoleClient = client.getServiceRoleClient();
        if (serviceRoleClient) {
            console.error('Attempting to list auth users via Supabase Admin API...');
            const { data, error } = await serviceRoleClient.auth.admin.listUsers({
                page: Math.floor(offset / limit) + 1,
                perPage: limit,
            });
            if (error) {
                context.log(`Supabase Admin API failed: ${error.message}. Falling back to DB...`, 'warn');
            } else if (data?.users) {
                console.error(`Found ${data.users.length} users via API.`);
                // Map API response to our schema
                const mapped = data.users.map((u: any) => ({
                    id: u.id,
                    email: u.email,
                    role: u.role,
                    raw_app_meta_data: u.app_metadata ?? u.raw_app_meta_data ?? null,
                    raw_user_meta_data: u.user_metadata ?? u.raw_user_meta_data ?? null,
                    created_at: u.created_at,
                    last_sign_in_at: u.last_sign_in_at,
                }));
                return ListAuthUsersOutputSchema.parse(mapped);
            }
        }

        // 2. Fallback to direct DB connection
        if (!client.isPgAvailable()) {
            throw new Error('Neither Supabase service role key (for Admin API) nor direct database connection (DATABASE_URL) is available. Cannot list auth users.');
        }

        const listUsersSql = `
            SELECT
                id,
                email,
                role,
                raw_app_meta_data,
                raw_user_meta_data,
                created_at::text,
                last_sign_in_at::text
            FROM
                auth.users
            ORDER BY
                created_at DESC
            LIMIT ${limit}
            OFFSET ${offset}
        `;

        console.error('Attempting to list auth users using direct DB connection...');
        const result = await client.executeSqlWithPg(listUsersSql);
        const validatedUsers = handleSqlResponse(result, ListAuthUsersOutputSchema);

        console.error(`Found ${validatedUsers.length} users via DB.`);
        context.log(`Found ${validatedUsers.length} users.`);
        return validatedUsers;
    },
}; 