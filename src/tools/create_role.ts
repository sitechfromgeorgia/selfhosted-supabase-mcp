/**
 * create_role — Creates a custom database role.
 *
 * Uses direct pg connection.
 * Privileged tool.
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';
import { validateIdentifiers, quoteIdentifier } from './ddl-utils.js';

const CreateRoleInputSchema = z.object({
    role_name: z.string().describe('New role name'),
    password: z.string().optional().describe('Role password (omit for no-login role)'),
    login: z.boolean().optional().default(false).describe('Allow login'),
    inherit: z.boolean().optional().default(true).describe('Inherit privileges from parent roles'),
    can_create_db: z.boolean().optional().default(false),
    can_create_role: z.boolean().optional().default(false),
    superuser: z.boolean().optional().default(false),
    dry_run: z.boolean().optional().default(false),
});

type CreateRoleInput = z.infer<typeof CreateRoleInputSchema>;

const CreateRoleOutputSchema = z.object({
    success: z.boolean(),
    message: z.string(),
    role_name: z.string(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        role_name: { type: 'string' },
        password: { type: 'string' },
        login: { type: 'boolean', default: false },
        inherit: { type: 'boolean', default: true },
        can_create_db: { type: 'boolean', default: false },
        can_create_role: { type: 'boolean', default: false },
        superuser: { type: 'boolean', default: false },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['role_name'],
};

export const createRoleTool = {
    name: 'create_role',
    description: 'Creates a new PostgreSQL database role. Use for custom application roles or service accounts.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: CreateRoleInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: CreateRoleOutputSchema,

    execute: async (input: CreateRoleInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { role_name, password, login, inherit, can_create_db, can_create_role, superuser: isSuperuser, dry_run } = input;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        validateIdentifiers([{ name: role_name, context: 'Role name' }]);

        const parts: string[] = ['CREATE ROLE', quoteIdentifier(role_name)];
        if (isSuperuser) parts.push('SUPERUSER');
        else parts.push('NOSUPERUSER');
        if (login) parts.push('LOGIN');
        else parts.push('NOLOGIN');
        if (inherit) parts.push('INHERIT');
        else parts.push('NOINHERIT');
        if (can_create_db) parts.push('CREATEDB');
        else parts.push('NOCREATEDB');
        if (can_create_role) parts.push('CREATEROLE');
        else parts.push('NOCREATEROLE');
        if (password) {
            parts.push(`PASSWORD ${quoteIdentifier(password)}`);
        }

        const sql = parts.join(' ') + ';';

        if (dry_run) {
            return {
                success: true,
                message: `DRY RUN: SQL prepared but not executed.`,
                role_name,
            };
        }

        context.log(`Creating role ${role_name}...`, 'info');

        const result = await client.executeSqlWithPg(sql);

        if ('error' in result) {
            throw new Error(`Failed to create role: ${result.error.message}`);
        }

        return {
            success: true,
            message: `Role "${role_name}" created successfully.`,
            role_name,
        };
    },
};
