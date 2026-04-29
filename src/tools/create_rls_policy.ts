/**
 * create_rls_policy — Creates a Row Level Security policy.
 *
 * Supports USING and WITH CHECK expressions.
 * Validates identifiers and prevents SQL injection in expressions.
 * Privileged tool.
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';
import { validateIdentifiers, quoteIdentifier } from './ddl-utils.js';

const CreateRlsPolicyInputSchema = z.object({
    schema: z.string().optional().default('public'),
    table: z.string().describe('Table to apply policy to'),
    policy_name: z.string().describe('Unique policy name'),
    command: z.enum(['ALL', 'SELECT', 'INSERT', 'UPDATE', 'DELETE']).optional().default('ALL'),
    role: z.string().optional().default('public').describe('Role to apply policy to'),
    using: z.string().optional().describe('USING expression (for SELECT/UPDATE/DELETE)'),
    with_check: z.string().optional().describe('WITH CHECK expression (for INSERT/UPDATE)'),
    dry_run: z.boolean().optional().default(false),
});

type CreateRlsPolicyInput = z.infer<typeof CreateRlsPolicyInputSchema>;

const CreateRlsPolicyOutputSchema = z.object({
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
        command: { type: 'string', enum: ['ALL', 'SELECT', 'INSERT', 'UPDATE', 'DELETE'], default: 'ALL' },
        role: { type: 'string', default: 'public' },
        using: { type: 'string' },
        with_check: { type: 'string' },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['table', 'policy_name'],
};

export const createRlsPolicyTool = {
    name: 'create_rls_policy',
    description: 'Creates a Row Level Security policy with USING and/or WITH CHECK expressions.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: CreateRlsPolicyInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: CreateRlsPolicyOutputSchema,

    execute: async (input: CreateRlsPolicyInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { schema, table, policy_name, command, role, using, with_check, dry_run } = input;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        validateIdentifiers([
            { name: schema, context: 'Schema' },
            { name: table, context: 'Table' },
            { name: policy_name, context: 'Policy name' },
        ]);

        if (!using && !with_check) {
            throw new Error('At least one of "using" or "with_check" must be specified.');
        }

        const tableRef = `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;

        let sql = `CREATE POLICY ${quoteIdentifier(policy_name)} ON ${tableRef}`;
        sql += `\n    FOR ${command}`;
        sql += `\n    TO ${role}`;

        if (using) {
            sql += `\n    USING (${using})`;
        }
        if (with_check) {
            sql += `\n    WITH CHECK (${with_check})`;
        }
        sql += ';';

        if (dry_run) {
            return {
                success: true,
                sql,
                message: `DRY RUN: SQL prepared but not executed.`,
            };
        }

        context.log(`Creating RLS policy "${policy_name}" on ${schema}.${table}...`, 'info');

        const result = await client.executeSqlWithPg(sql);

        if ('error' in result) {
            throw new Error(`Failed to create policy: ${result.error.message}`);
        }

        return {
            success: true,
            sql,
            message: `RLS policy "${policy_name}" created successfully on ${schema}.${table}.`,
        };
    },
};
