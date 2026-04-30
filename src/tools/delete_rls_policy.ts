/**
 * delete_rls_policy — Removes a Row Level Security policy.
 *
 * Safety Features:
 * - IF EXISTS guard (default: true)
 * - Validates identifiers
 * - Privileged tool
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';
import { validateIdentifiers, quoteIdentifier } from './ddl-utils.js';

const DeleteRlsPolicyInputSchema = z.object({
    schema: z.string().optional().default('public'),
    table: z.string().describe('Table containing the policy'),
    policy_name: z.string().describe('Policy to delete'),
    if_exists: z.boolean().optional().default(true),
    dry_run: z.boolean().optional().default(false),
});

type DeleteRlsPolicyInput = z.infer<typeof DeleteRlsPolicyInputSchema>;

const DeleteRlsPolicyOutputSchema = z.object({
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
        if_exists: { type: 'boolean', default: true },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['table', 'policy_name'],
};

export const deleteRlsPolicyTool = {
    name: 'delete_rls_policy',
    description: 'Deletes a Row Level Security policy from a table.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: DeleteRlsPolicyInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: DeleteRlsPolicyOutputSchema,

    execute: async (input: DeleteRlsPolicyInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { schema, table, policy_name, if_exists: ifExistsInput, dry_run } = input;
        const resolvedSchema = schema || 'public';
        const if_exists = ifExistsInput ?? true;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        validateIdentifiers([
            { name: resolvedSchema, context: 'Schema' },
            { name: table, context: 'Table' },
            { name: policy_name, context: 'Policy name' },
        ]);

        const ifExistsClause = if_exists ? 'IF EXISTS ' : '';
        const tableRef = `${quoteIdentifier(resolvedSchema)}.${quoteIdentifier(table)}`;
        const sql = `DROP POLICY ${ifExistsClause}${quoteIdentifier(policy_name)} ON ${tableRef};`;

        if (dry_run) {
            return {
                success: true,
                sql,
                message: `DRY RUN: SQL prepared but not executed.`,
            };
        }

        context.log(`Deleting RLS policy "${policy_name}" from ${schema}.${table}...`, 'info');

        const result = await client.executeSqlWithPg(sql);

        if ('error' in result) {
            throw new Error(`Failed to delete policy: ${result.error.message}`);
        }

        return {
            success: true,
            sql,
            message: `RLS policy "${policy_name}" deleted from ${schema}.${table}.`,
        };
    },
};
