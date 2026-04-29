import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';
import { handleSqlResponse, isSqlErrorResponse } from './utils.js';

// Input schema: User ID
const DeleteAuthUserInputSchema = z.object({
    user_id: z.string().uuid().describe('The UUID of the user to delete.'),
});
type DeleteAuthUserInput = z.infer<typeof DeleteAuthUserInputSchema>;

// Output schema: Success status and message
const DeleteAuthUserOutputSchema = z.object({
    success: z.boolean(),
    message: z.string(),
});

// Static JSON Schema for MCP capabilities
const mcpInputSchema = {
    type: 'object',
    properties: {
        user_id: {
            type: 'string',
            format: 'uuid',
            description: 'The UUID of the user to delete.',
        },
    },
    required: ['user_id'],
};

// Tool definition
export const deleteAuthUserTool = {
    name: 'delete_auth_user',
    description: 'Deletes a user from auth.users by their ID. Requires service_role key and direct DB connection.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: DeleteAuthUserInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: DeleteAuthUserOutputSchema,

    execute: async (input: DeleteAuthUserInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { user_id } = input;

        // 1. Try Supabase Admin API
        const serviceRoleClient = client.getServiceRoleClient();
        if (serviceRoleClient) {
            console.error(`Deleting user ${user_id} via Supabase Admin API...`);
            const { error } = await serviceRoleClient.auth.admin.deleteUser(user_id);
            if (error) {
                context.log(`Supabase Admin API failed: ${error.message}. Falling back to DB...`, 'warn');
            } else {
                console.error(`Successfully deleted user ${user_id} via API.`);
                return { success: true, message: `Successfully deleted user with ID: ${user_id}` };
            }
        }

        // 2. Fallback to direct DB
        if (!client.isPgAvailable()) {
            throw new Error('Neither Supabase service role key (for Admin API) nor direct database connection (DATABASE_URL) is available. Cannot delete auth user.');
        }

        try {
            const result = await client.executeTransactionWithPg(async (pgClient) => {
                const deleteResult = await pgClient.query('DELETE FROM auth.users WHERE id = $1', [user_id]);
                return deleteResult;
            });

            if (result.rowCount === 1) {
                return { success: true, message: `Successfully deleted user with ID: ${user_id}` };
            }
            return { success: false, message: `User with ID ${user_id} not found or could not be deleted.` };
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to delete user ${user_id}: ${errorMessage}`);
        }
    },
}; 