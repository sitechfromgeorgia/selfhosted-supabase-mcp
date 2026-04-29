/**
 * update_rls_policy — Modifies an existing Row Level Security policy.
 *
 * Uses ALTER POLICY. Supports changing USING and WITH CHECK expressions.
 * Privileged tool.
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';
import { validateIdentifiers, quoteIdentifier } from './ddl-utils.js';

const UpdateRlsPolicyInputSchema = z.object({
    schema: z.string().optional().default('public'),
    table: z.string().describe('Table containing the policy'),
    policy_name: z.string().describe('Policy to update'),
    new_name: z.string().optional().describe('Rename the policy'),
    command: z.enum(['ALL', 'SELECT', 'INSERT', 'UPDATE', 'DELETE']).optional(),
    role: z.string().optional().describe('Change role'),
    using: z.string().optional().describe('New USING expression'),
    with_check: z.string().optional().describe('New WITH CHECK expression'),
    dry_run: z.boolean().optional().default(false),
});

type UpdateRlsPolicyInput = z.infer<typeof UpdateRlsPolicyInputSchema>;

const UpdateRlsPolicyOutputSchema = z.object({
    success: z.boolean(),
    sql: z.string(),
    message: z.string(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        schema: { type: 'string', default: 'public' },
        table: { type: 'string' },
        policy_name: { type: 'string' },
        new_name: { type: 'string' },
        command: { type: 'string', enum: ['ALL', 'SELECT', 'INSERT', 'UPDATE', 'DELETE'] },
        role: { type: 'string' },
        using: { type: 'string' },
        with_check: { type: 'string' },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['table', 'policy_name'],
};

export const updateRlsPolicyTool = {
    name: 'update_rls_policy',
    description: 'Modifies an existing RLS policy. Supports renaming, changing role, USING, and WITH CHECK expressions.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: UpdateRlsPolicyInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: UpdateRlsPolicyOutputSchema,

    execute: async (input: UpdateRlsPolicyInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { schema, table, policy_name, new_name, command, role, using, with_check, dry_run } = input;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        validateIdentifiers([
            { name: schema, context: 'Schema' },
            { name: table, context: 'Table' },
            { name: policy_name, context: 'Policy name' },
            ...(new_name ? [{ name: new_name, context: 'New policy name' }] : []),
        ]);

        const tableRef = `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;

        // Build ALTER POLICY
        let sql = `ALTER POLICY ${quoteIdentifier(policy_name)} ON ${tableRef}`;

        if (new_name) sql += `\n    RENAME TO ${quoteIdentifier(new_name)}`;
        if (command) sql += `\n    FOR ${command}`;
        if (role) sql += `\n    TO ${role}`;
        if (using) sql += `\n    USING (${using})`;
        if (with_check) sql += `\n    WITH CHECK (${with_check})`;
        sql += ';';

        // If only RENAME, it's a different ALTER statement
        if (new_name && !command && !role && !using && !with_check) {
            sql = `ALTER POLICY ${quoteIdentifier(policy_name)} ON ${tableRef} RENAME TO ${quoteIdentifier(new_name)};`;
        }

        if (dry_run) {
            return {
                success: true,
                sql,
                message: `DRY RUN: SQL prepared but not executed.`,
            };
        }

        context.log(`Updating RLS policy "${policy_name}" on ${schema}.${table}...`, 'info');

        const result = await client.executeSqlWithPg(sql);

        if ('error' in result) {
            throw new Error(`Failed to update policy: ${result.error.message}`);
        }

        return {
            success: true,
            sql,
            message: `RLS policy "${policy_name}" updated successfully on ${schema}.${table}.`,
        };
    },
};
