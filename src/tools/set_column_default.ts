/**
 * set_column_default - Sets or removes the default value of a column.
 *
 * This is a convenience wrapper around alter_table operations for
 * single-column default changes. Supports both SET DEFAULT and DROP DEFAULT.
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';
import { executeSqlWithFallback } from './utils.js';
import { validateIdentifiers, quoteIdentifier } from './ddl-utils.js';

const SetColumnDefaultInputSchema = z.object({
    schema: z.string().optional().default('public'),
    table: z.string().describe('Table name'),
    column: z.string().describe('Column name'),
    default_value: z.string().optional().describe('Default value expression (omit to drop default)'),
    dry_run: z.boolean().optional().default(false),
});

type SetColumnDefaultInput = z.infer<typeof SetColumnDefaultInputSchema>;

const SetColumnDefaultOutputSchema = z.object({
    success: z.boolean(),
    sql: z.string(),
    message: z.string(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        schema: { type: 'string', default: 'public' },
        table: { type: 'string' },
        column: { type: 'string' },
        default_value: { type: 'string' },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['table', 'column'],
};

export const setColumnDefaultTool = {
    name: 'set_column_default',
    description: 'Sets or removes the default value of a table column. Omit default_value to drop the default.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: SetColumnDefaultInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: SetColumnDefaultOutputSchema,

    execute: async (input: SetColumnDefaultInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { schema, table, column, default_value, dry_run } = input;

        validateIdentifiers([
            { name: schema, context: 'Schema' },
            { name: table, context: 'Table' },
            { name: column, context: 'Column' },
        ]);

        const tableRef = `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
        const colRef = quoteIdentifier(column);

        const sql = default_value !== undefined
            ? `ALTER TABLE ${tableRef} ALTER COLUMN ${colRef} SET DEFAULT ${default_value};`
            : `ALTER TABLE ${tableRef} ALTER COLUMN ${colRef} DROP DEFAULT;`;

        if (dry_run) {
            return {
                success: true,
                sql,
                message: `DRY RUN: SQL prepared but not executed.`,
            };
        }

        context.log(
            default_value !== undefined
                ? `Setting default for ${schema}.${table}.${column} to ${default_value}...`
                : `Dropping default for ${schema}.${table}.${column}...`,
            'info'
        );

        const result = await executeSqlWithFallback(client, sql, false);

        if ('error' in result) {
            throw new Error(`Failed to set column default: ${result.error.message}`);
        }

        return {
            success: true,
            sql,
            message: default_value !== undefined
                ? `Default value for ${schema}.${table}.${column} set to ${default_value}.`
                : `Default value dropped from ${schema}.${table}.${column}.`,
        };
    },
};
