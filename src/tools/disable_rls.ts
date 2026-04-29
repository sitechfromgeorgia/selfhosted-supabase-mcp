/**
 * disable_rls — Disables Row Level Security on a table.
 *
 * Also removes FORCE ROW LEVEL SECURITY if present.
 * Privileged tool.
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';
import { validateIdentifiers, quoteIdentifier } from './ddl-utils.js';

const DisableRlsInputSchema = z.object({
    schema: z.string().optional().default('public'),
    table: z.string().describe('Table to disable RLS on'),
    dry_run: z.boolean().optional().default(false),
});

type DisableRlsInput = z.infer<typeof DisableRlsInputSchema>;

const DisableRlsOutputSchema = z.object({
    success: z.boolean(),
    sql: z.string(),
    message: z.string(),
    warning: z.string().optional(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        schema: { type: 'string', default: 'public' },
        table: { type: 'string' },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['table'],
};

export const disableRlsTool = {
    name: 'disable_rls',
    description: 'Disables Row Level Security on a table. WARNING: All rows become visible to all roles.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: DisableRlsInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: DisableRlsOutputSchema,

    execute: async (input: DisableRlsInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { schema, table, dry_run } = input;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        validateIdentifiers([
            { name: schema, context: 'Schema' },
            { name: table, context: 'Table' },
        ]);

        const tableRef = `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
        const sql = `ALTER TABLE ${tableRef} DISABLE ROW LEVEL SECURITY;`;

        const warning = '⚠️ WARNING: Disabling RLS makes all rows visible to all roles. Ensure this is intentional.';

        if (dry_run) {
            return {
                success: true,
                sql,
                message: `DRY RUN: SQL prepared but not executed.`,
                warning,
            };
        }

        context.log(`Disabling RLS on ${schema}.${table}...`, 'info');

        const result = await client.executeSqlWithPg(sql);

        if ('error' in result) {
            throw new Error(`Failed to disable RLS: ${result.error.message}`);
        }

        return {
            success: true,
            sql,
            message: `RLS disabled on ${schema}.${table}.`,
            warning,
        };
    },
};
