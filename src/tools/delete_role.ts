/**
 * delete_role — Drops a custom PostgreSQL role.
 *
 * Safety Features:
 * - Validates role name
 * - Reassigns owned objects before dropping
 * - Privileged tool
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';
import { validateIdentifiers, quoteIdentifier } from './ddl-utils.js';

const DeleteRoleInputSchema = z.object({
    role_name: z.string().describe('Role to delete'),
    reassign_to: z.string().optional().describe('Reassign owned objects to this role before dropping'),
    dry_run: z.boolean().optional().default(false),
});

type DeleteRoleInput = z.infer<typeof DeleteRoleInputSchema>;

const DeleteRoleOutputSchema = z.object({
    success: z.boolean(),
    message: z.string(),
    sql: z.string(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        role_name: { type: 'string' },
        reassign_to: { type: 'string' },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['role_name'],
};

export const deleteRoleTool = {
    name: 'delete_role',
    description: 'Drops a PostgreSQL role. Optionally reassigns owned objects first.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: DeleteRoleInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: DeleteRoleOutputSchema,

    execute: async (input: DeleteRoleInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { role_name, reassign_to, dry_run } = input;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        validateIdentifiers([{ name: role_name, context: 'Role name' }]);

        const parts: string[] = [];

        if (reassign_to) {
            validateIdentifiers([{ name: reassign_to, context: 'Reassign target role' }]);
            parts.push(`REASSIGN OWNED BY ${quoteIdentifier(role_name)} TO ${quoteIdentifier(reassign_to)};`);
            parts.push(`DROP OWNED BY ${quoteIdentifier(role_name)};`);
        }

        parts.push(`DROP ROLE ${quoteIdentifier(role_name)};`);
        const sql = parts.join('\n');

        if (dry_run) {
            return {
                success: true,
                message: `DRY RUN: Would drop role "${role_name}".${reassign_to ? ' Objects reassigned to ' + reassign_to + '.' : ''}`,
                sql,
            };
        }

        context.log(`Dropping role "${role_name}"...`, 'info');

        const result = await client.executeSqlWithPg(sql);

        if ('error' in result) {
            throw new Error(`Failed to drop role: ${result.error.message}`);
        }

        return {
            success: true,
            message: `Role "${role_name}" dropped successfully.`,
            sql,
        };
    },
};
