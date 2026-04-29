import { z } from 'zod';
import type { ToolContext } from './types.js';
import { handleSqlResponse } from './utils.js';
import type { PoolClient } from 'pg';
import type { SqlSuccessResponse, AuthUser } from '../types/index.js'; // Import AuthUser

// Input schema
const GetAuthUserInputSchema = z.object({
    user_id: z.string().uuid().describe('The UUID of the user to retrieve.'),
});
type GetAuthUserInput = z.infer<typeof GetAuthUserInputSchema>;

// Output schema - Zod for validation (single user)
const AuthUserZodSchema = z.object({
    id: z.string().uuid(),
    email: z.string().email('Invalid email').nullable(),
    role: z.string().nullable(),
    created_at: z.string().nullable(),
    last_sign_in_at: z.string().nullable(),
    raw_app_meta_data: z.record(z.string(), z.unknown()).nullable(),
    raw_user_meta_data: z.record(z.string(), z.unknown()).nullable(),
    // Add more fields as needed
});
// Use AuthUser for the output type hint
type GetAuthUserOutput = AuthUser;

// Static JSON Schema for MCP
const mcpInputSchema = {
    type: 'object',
    properties: {
        user_id: {
            type: 'string',
            description: 'The UUID of the user to retrieve.',
            format: 'uuid', // Hint format if possible
        },
    },
    required: ['user_id'],
};

// Tool definition
export const getAuthUserTool = {
    name: 'get_auth_user',
    description: 'Retrieves details for a specific user from auth.users by their ID.',
    inputSchema: GetAuthUserInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: AuthUserZodSchema, // Use the single user Zod schema

    execute: async (input: GetAuthUserInput, context: ToolContext): Promise<GetAuthUserOutput> => {
        const client = context.selfhostedClient;
        const { user_id } = input;

        // 1. Try Supabase Admin API
        const serviceRoleClient = client.getServiceRoleClient();
        if (serviceRoleClient) {
            console.error(`Attempting to get auth user ${user_id} via Supabase Admin API...`);
            const { data, error } = await serviceRoleClient.auth.admin.getUserById(user_id);
            if (error) {
                context.log(`Supabase Admin API failed: ${error.message}. Falling back to DB...`, 'warn');
            } else if (data?.user) {
                const u = data.user;
                return AuthUserZodSchema.parse({
                    id: u.id,
                    email: u.email,
                    role: u.role,
                    raw_app_meta_data: u.app_metadata ?? null,
                    raw_user_meta_data: u.user_metadata ?? null,
                    created_at: u.created_at,
                    last_sign_in_at: u.last_sign_in_at,
                });
            }
        }

        // 2. Fallback to direct DB
        if (!client.isPgAvailable()) {
            throw new Error('Neither Supabase service role key (for Admin API) nor direct database connection (DATABASE_URL) is available. Cannot get auth user.');
        }

        const sql = `
            SELECT
                id, email, role,
                raw_app_meta_data, raw_user_meta_data,
                created_at::text, last_sign_in_at::text
            FROM auth.users
            WHERE id = $1
        `;
        const params = [user_id];

        console.error(`Attempting to get auth user ${user_id} using direct DB connection...`);
        const user = await client.executeTransactionWithPg(async (pgClient: PoolClient) => {
            const result = await pgClient.query(sql, params);
            if (result.rows.length === 0) {
                throw new Error(`User with ID ${user_id} not found.`);
            }
            try {
                return AuthUserZodSchema.parse(result.rows[0]);
            } catch (validationError) {
                if (validationError instanceof z.ZodError) {
                    throw new Error(`Output validation failed: ${validationError.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
                }
                throw validationError;
            }
        });

        console.error(`Found user ${user_id}.`);
        context.log(`Found user ${user_id}.`);
        return user;
    },
}; 