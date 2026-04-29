/**
 * list_roles — Lists database roles.
 *
 * Uses direct pg connection.
 * Regular tool.
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';

const ListRolesInputSchema = z.object({
    exclude_system: z.boolean().optional().default(true).describe('Exclude built-in PostgreSQL roles'),
});

type ListRolesInput = z.infer<typeof ListRolesInputSchema>;

const RoleSchema = z.object({
    rolname: z.string(),
    rolsuper: z.boolean(),
    rolinherit: z.boolean(),
    rolcreaterole: z.boolean(),
    rolcreatedb: z.boolean(),
    rolcanlogin: z.boolean(),
    rolconnlimit: z.number(),
});

const ListRolesOutputSchema = z.object({
    success: z.boolean(),
    roles: z.array(RoleSchema),
    count: z.number(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        exclude_system: { type: 'boolean', default: true },
    },
    required: [],
};

export const listRolesTool = {
    name: 'list_roles',
    description: 'Lists PostgreSQL database roles with their permissions.',
    privilegeLevel: 'regular' as ToolPrivilegeLevel,
    inputSchema: ListRolesInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: ListRolesOutputSchema,

    execute: async (input: ListRolesInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { exclude_system } = input;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        context.log('Listing database roles...', 'info');

        let sql = `
            SELECT
                rolname,
                rolsuper,
                rolinherit,
                rolcreaterole,
                rolcreatedb,
                rolcanlogin,
                rolconnlimit
            FROM pg_roles
        `;

        if (exclude_system) {
            sql += ` WHERE rolname NOT LIKE 'pg_%' AND rolname NOT LIKE 'rds%' AND rolname != 'postgres'`;
        }

        sql += ' ORDER BY rolname;';

        const result = await client.executeSqlWithPg(sql);

        if ('error' in result) {
            throw new Error(`Failed to list roles: ${result.error.message}`);
        }

        const roles = result as any[];

        return {
            success: true,
            roles,
            count: roles.length,
        };
    },
};
