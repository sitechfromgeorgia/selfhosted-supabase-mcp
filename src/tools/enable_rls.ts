/**
 * enable_rls — Enables Row Level Security on a table.
 *
 * Optionally forces RLS for table owners too.
 * Privileged tool.
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';
import { validateIdentifiers, quoteIdentifier } from './ddl-utils.js';

const EnableRlsInputSchema = z.object({
    schema: z.string().optional().default('public'),
    table: z.string().describe('Table to enable RLS on'),
    force: z.boolean().optional().default(false).describe('Force RLS for table owner too'),
    dry_run: z.boolean().optional().default(false),
});

type EnableRlsInput = z.infer<typeof EnableRlsInputSchema>;

const EnableRlsOutputSchema = z.object({
    success: z.boolean(),
    sql: z.string(),
    message: z.string(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        schema: { type: 'string', default: 'public' },
        table: { type: 'string' },
        force: { type: 'boolean', default: false },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['table'],
};

export const enableRlsTool = {
    name: 'enable_rls',
    description: 'Enables Row Level Security on a table. Optionally forces RLS for the table owner.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: EnableRlsInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: EnableRlsOutputSchema,

    execute: async (input: EnableRlsInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { schema, table, force, dry_run } = input;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        validateIdentifiers([
            { name: schema, context: 'Schema' },
            { name: table, context: 'Table' },
        ]);

        const tableRef = `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
        let sql = `ALTER TABLE ${tableRef} ENABLE ROW LEVEL SECURITY;`;

        if (force) {
            sql += `\nALTER TABLE ${tableRef} FORCE ROW LEVEL SECURITY;`;
        }

        if (dry_run) {
            return {
                success: true,
                sql,
                message: `DRY RUN: SQL prepared but not executed.`,
            };
        }

        context.log(`Enabling RLS on ${schema}.${table}...`, 'info');

        const result = await client.executeSqlWithPg(sql);

        if ('error' in result) {
            throw new Error(`Failed to enable RLS: ${result.error.message}`);
        }

        return {
            success: true,
            sql,
            message: `RLS enabled on ${schema}.${table}.${force ? ' Forced for owner.' : ''}`,
        };
    },
};
