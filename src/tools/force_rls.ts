/**
 * force_rls — Forces Row Level Security for table owners.
 *
 * Even the table owner must satisfy RLS policies.
 * Privileged tool.
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';
import { validateIdentifiers, quoteIdentifier } from './ddl-utils.js';

const ForceRlsInputSchema = z.object({
    schema: z.string().optional().default('public'),
    table: z.string().describe('Table to force RLS on'),
    dry_run: z.boolean().optional().default(false),
});

type ForceRlsInput = z.infer<typeof ForceRlsInputSchema>;

const ForceRlsOutputSchema = z.object({
    success: z.boolean(),
    sql: z.string(),
    message: z.string(),
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

export const forceRlsTool = {
    name: 'force_rls',
    description: 'Forces Row Level Security for table owners (bypass privilege is removed).',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: ForceRlsInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: ForceRlsOutputSchema,

    execute: async (input: ForceRlsInput, context: ToolContext) => {
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
        const sql = `ALTER TABLE ${tableRef} FORCE ROW LEVEL SECURITY;`;

        if (dry_run) {
            return {
                success: true,
                sql,
                message: `DRY RUN: SQL prepared but not executed.`,
            };
        }

        context.log(`Forcing RLS on ${schema}.${table}...`, 'info');

        const result = await client.executeSqlWithPg(sql);

        if ('error' in result) {
            throw new Error(`Failed to force RLS: ${result.error.message}`);
        }

        return {
            success: true,
            sql,
            message: `RLS forced on ${schema}.${table}. Table owner must now satisfy policies.`,
        };
    },
};
