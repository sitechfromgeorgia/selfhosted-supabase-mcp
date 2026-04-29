import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';
import { handleSqlResponse } from './utils.js';
import type { PoolClient } from 'pg';
import type { SqlSuccessResponse, AuthUser } from '../types/index.js'; // Import AuthUser

// Input schema
const CreateAuthUserInputSchema = z.object({
    email: z.string().email('Invalid email address').describe('The email address for the new user.'),
    password: z.string().min(6, 'Password must be at least 6 characters').describe('Plain text password (min 6 chars). WARNING: Insecure.'),
    role: z.optional(z.string()).describe('User role.'),
    app_metadata: z.optional(z.record(z.string(), z.unknown())).describe('Optional app metadata.'),
    user_metadata: z.optional(z.record(z.string(), z.unknown())).describe('Optional user metadata.'),
});
type CreateAuthUserInput = z.infer<typeof CreateAuthUserInputSchema>;

// Output schema - Zod validation for the created user (should match AuthUser structure)
const CreatedAuthUserZodSchema = z.object({
    id: z.string().uuid(),
    email: z.string().email('Invalid email').nullable(),
    role: z.string().nullable(),
    created_at: z.string().nullable(),
    last_sign_in_at: z.string().nullable(), // Will likely be null on creation
    raw_app_meta_data: z.record(z.string(), z.unknown()).nullable(),
    raw_user_meta_data: z.record(z.string(), z.unknown()).nullable(),
    // Add other fields returned by the INSERT if necessary
});
// Use AuthUser for the output type hint
type CreateAuthUserOutput = AuthUser;

// Static JSON Schema for MCP capabilities
const mcpInputSchema = {
    type: 'object',
    properties: {
        email: { type: 'string', format: 'email', description: 'The email address for the new user.' },
        password: { type: 'string', minLength: 6, description: 'Plain text password (min 6 chars). WARNING: Insecure.' },
        role: { type: 'string', default: 'authenticated', description: 'User role.' },
        user_metadata: { type: 'object', description: 'Optional user metadata.' },
        app_metadata: { type: 'object', description: 'Optional app metadata.' },
    },
    required: ['email', 'password'],
};

// Tool definition
export const createAuthUserTool = {
    name: 'create_auth_user',
    description: 'Creates a new user directly in auth.users. WARNING: Requires plain password, insecure. Use with extreme caution.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: CreateAuthUserInputSchema,
    mcpInputSchema: mcpInputSchema, // Ensure defined above
    outputSchema: CreatedAuthUserZodSchema,

    execute: async (input: CreateAuthUserInput, context: ToolContext): Promise<CreateAuthUserOutput> => {
        const client = context.selfhostedClient;
        const { email, password, role, app_metadata, user_metadata } = input;

        // 1. Try Supabase Admin API (more secure — handles password hashing server-side)
        const serviceRoleClient = client.getServiceRoleClient();
        if (serviceRoleClient) {
            console.error(`Creating user ${email} via Supabase Admin API...`);
            const { data, error } = await serviceRoleClient.auth.admin.createUser({
                email,
                password,
                email_confirm: true,
                role: role || 'authenticated',
                user_metadata: user_metadata || {},
                app_metadata: app_metadata || {},
            });
            if (error) {
                context.log(`Supabase Admin API failed: ${error.message}. Falling back to DB...`, 'warn');
            } else if (data?.user) {
                const u = data.user;
                console.error(`Successfully created user ${email} with ID ${u.id} via API.`);
                return CreatedAuthUserZodSchema.parse({
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

        // 2. Fallback to direct DB insert
        if (!client.isPgAvailable()) {
            throw new Error('Neither Supabase service role key (for Admin API) nor direct database connection (DATABASE_URL) is available. Cannot create auth user.');
        }

        context.log(`Creating user ${email} via DB...`, 'info');

        const createdUser = await client.executeTransactionWithPg(async (pgClient: PoolClient) => {
            try {
                await pgClient.query("SELECT crypt('test', gen_salt('bf'))");
            } catch (err) {
                throw new Error('Failed to execute crypt function. Ensure pgcrypto extension is enabled.');
            }
            
            const sql = `
                INSERT INTO auth.users (
                    instance_id, email, encrypted_password, role,
                    raw_app_meta_data, raw_user_meta_data, 
                    aud, email_confirmed_at, confirmation_sent_at
                )
                VALUES (
                    COALESCE(current_setting('app.instance_id', TRUE), '00000000-0000-0000-0000-000000000000')::uuid,
                    $1, crypt($2, gen_salt('bf')), $3, $4::jsonb, $5::jsonb,
                    'authenticated', now(), now()
                )
                RETURNING id, email, role, raw_app_meta_data, raw_user_meta_data, created_at::text, last_sign_in_at::text;
            `;
            const params = [email, password, role || 'authenticated', JSON.stringify(app_metadata || {}), JSON.stringify(user_metadata || {})];

            try {
                const result = await pgClient.query(sql, params);
                if (result.rows.length === 0) {
                    throw new Error('User creation failed, no user returned after insert.');
                }
                return CreatedAuthUserZodSchema.parse(result.rows[0]);
            } catch (dbError: unknown) {
                let errorMessage = 'Unknown database error during user creation';
                if (typeof dbError === 'object' && dbError !== null && 'code' in dbError) {
                    const errorCode = String((dbError as { code: unknown }).code);
                    const errorMsg = 'message' in dbError && typeof (dbError as { message: unknown }).message === 'string'
                        ? (dbError as { message: string }).message : undefined;
                    if (errorCode === '23505') {
                        errorMessage = `User creation failed: Email '${email}' likely already exists.`;
                    } else if (errorMsg) {
                        errorMessage = `Database error (${errorCode}): ${errorMsg}`;
                    }
                } else if (dbError instanceof Error) {
                    errorMessage = dbError.message;
                }
                throw new Error(errorMessage);
            }
        });

        console.error(`Successfully created user ${email} with ID ${createdUser.id}.`);
        context.log(`Successfully created user ${email} with ID ${createdUser.id}.`);
        return createdUser;
    },
}; 