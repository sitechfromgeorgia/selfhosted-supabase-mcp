/**
 * rename_table - Renames a database table.
 *
 * Optionally updates dependent views, triggers, and foreign key references
 * to use the new table name (via pg_depend or manual updates).
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';
import { executeSqlWithFallback } from './utils.js';
import { validateIdentifiers, quoteIdentifier } from './ddl-utils.js';

const RenameTableInputSchema = z.object({
    schema: z.string().optional().default('public'),
    table: z.string().describe('Current table name'),
    new_name: z.string().describe('New table name'),
    dry_run: z.boolean().optional().default(false),
});

type RenameTableInput = z.infer<typeof RenameTableInputSchema>;

const RenameTableOutputSchema = z.object({
    success: z.boolean(),
    sql: z.string(),
    message: z.string(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        schema: { type: 'string', default: 'public' },
        table: { type: 'string' },
        new_name: { type: 'string' },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['table', 'new_name'],
};

export const renameTableTool = {
    name: 'rename_table',
    description: 'Renames a database table. Note: dependent views/triggers may need manual updates.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: RenameTableInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: RenameTableOutputSchema,

    execute: async (input: RenameTableInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { schema, table, new_name, dry_run } = input;

        validateIdentifiers([
            { name: schema, context: 'Schema' },
            { name: table, context: 'Table' },
            { name: new_name, context: 'New table name' },
        ]);

        const tableRef = `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
        const newRef = `${quoteIdentifier(schema)}.${quoteIdentifier(new_name)}`;

        const sql = `ALTER TABLE ${tableRef} RENAME TO ${quoteIdentifier(new_name)};`;

        if (dry_run) {
            return {
                success: true,
                sql,
                message: `DRY RUN: SQL prepared but not executed.`,
            };
        }

        context.log(`Renaming table ${schema}.${table} to ${new_name}...`, 'info');

        const result = await executeSqlWithFallback(client, sql, false);

        if ('error' in result) {
            throw new Error(`Failed to rename table: ${result.error.message}`);
        }

        return {
            success: true,
            sql,
            message: `Table ${schema}.${table} renamed to ${new_name} successfully.`,
        };
    },
};
