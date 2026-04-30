/**
 * alter_table - Modifies an existing database table.
 *
 * Supports:
 * - add_column: Add a new column
 * - drop_column: Remove a column
 * - rename_column: Rename an existing column
 * - alter_column_type: Change column data type
 * - set_not_null: Add NOT NULL constraint
 * - drop_not_null: Remove NOT NULL constraint
 * - set_default: Set default value
 * - drop_default: Remove default value
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';
import { executeSqlWithFallback } from './utils.js';
import { validateIdentifiers, quoteIdentifier, DataTypeSchema } from './ddl-utils.js';

const AlterOperationSchema = z.discriminatedUnion('operation', [
    z.object({
        operation: z.literal('add_column'),
        column: z.string().describe('New column name'),
        type: DataTypeSchema.describe('PostgreSQL data type'),
        nullable: z.boolean().optional().default(true),
        default_value: z.string().optional().describe('Default value expression'),
    }),
    z.object({
        operation: z.literal('drop_column'),
        column: z.string().describe('Column to remove'),
        if_exists: z.boolean().optional().default(false),
        cascade: z.boolean().optional().default(false),
    }),
    z.object({
        operation: z.literal('rename_column'),
        column: z.string().describe('Current column name'),
        new_name: z.string().describe('New column name'),
    }),
    z.object({
        operation: z.literal('alter_column_type'),
        column: z.string().describe('Column to modify'),
        new_type: DataTypeSchema.describe('New data type'),
        using: z.string().optional().describe('USING expression for conversion'),
    }),
    z.object({
        operation: z.literal('set_not_null'),
        column: z.string().describe('Column to make NOT NULL'),
    }),
    z.object({
        operation: z.literal('drop_not_null'),
        column: z.string().describe('Column to allow NULL'),
    }),
    z.object({
        operation: z.literal('set_default'),
        column: z.string().describe('Column to set default'),
        default_value: z.string().describe('Default value expression'),
    }),
    z.object({
        operation: z.literal('drop_default'),
        column: z.string().describe('Column to remove default'),
    }),
]);

const AlterTableInputSchema = z.object({
    schema: z.string().optional().default('public'),
    table: z.string().describe('Table to modify'),
    operations: z.array(AlterOperationSchema).min(1).describe('Array of alter operations'),
    dry_run: z.boolean().optional().default(false),
});

type AlterTableInput = z.infer<typeof AlterTableInputSchema>;

const AlterTableOutputSchema = z.object({
    success: z.boolean(),
    sql_statements: z.array(z.string()),
    message: z.string(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        schema: { type: 'string', default: 'public' },
        table: { type: 'string' },
        operations: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    operation: { type: 'string', enum: ['add_column', 'drop_column', 'rename_column', 'alter_column_type', 'set_not_null', 'drop_not_null', 'set_default', 'drop_default'] },
                    column: { type: 'string' },
                    new_name: { type: 'string' },
                    type: { type: 'string' },
                    new_type: { type: 'string' },
                    nullable: { type: 'boolean' },
                    default_value: { type: 'string' },
                    if_exists: { type: 'boolean' },
                    cascade: { type: 'boolean' },
                    using: { type: 'string' },
                },
            },
        },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['table', 'operations'],
};

export const alterTableTool = {
    name: 'alter_table',
    description: 'Modifies an existing table structure: add/drop/rename columns, change types, set defaults, toggle NOT NULL.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: AlterTableInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: AlterTableOutputSchema,

    execute: async (input: AlterTableInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { schema, table, operations, dry_run } = input;
        const resolvedSchema = schema || 'public';

        // Validate identifiers
        const identifiers = [{ name: resolvedSchema, context: 'Schema' }, { name: table, context: 'Table' }];
        for (const op of operations) {
            identifiers.push({ name: op.column, context: 'Column' });
            if ('new_name' in op) identifiers.push({ name: op.new_name, context: 'New column name' });
        }
        validateIdentifiers(identifiers);

        const tableRef = `${quoteIdentifier(resolvedSchema)}.${quoteIdentifier(table)}`;
        const sqlStatements: string[] = [];

        for (const op of operations) {
            switch (op.operation) {
                case 'add_column': {
                    let colDef = `${quoteIdentifier(op.column)} ${op.type}`;
                    if (!op.nullable) colDef += ' NOT NULL';
                    if (op.default_value) colDef += ` DEFAULT ${op.default_value}`;
                    sqlStatements.push(`ALTER TABLE ${tableRef} ADD COLUMN ${colDef};`);
                    break;
                }
                case 'drop_column': {
                    const ifExists = op.if_exists ? 'IF EXISTS ' : '';
                    const cascade = op.cascade ? ' CASCADE' : '';
                    sqlStatements.push(`ALTER TABLE ${tableRef} DROP COLUMN ${ifExists}${quoteIdentifier(op.column)}${cascade};`);
                    break;
                }
                case 'rename_column': {
                    sqlStatements.push(`ALTER TABLE ${tableRef} RENAME COLUMN ${quoteIdentifier(op.column)} TO ${quoteIdentifier(op.new_name)};`);
                    break;
                }
                case 'alter_column_type': {
                    const usingClause = op.using ? ` USING ${op.using}` : '';
                    sqlStatements.push(`ALTER TABLE ${tableRef} ALTER COLUMN ${quoteIdentifier(op.column)} SET DATA TYPE ${op.new_type}${usingClause};`);
                    break;
                }
                case 'set_not_null': {
                    sqlStatements.push(`ALTER TABLE ${tableRef} ALTER COLUMN ${quoteIdentifier(op.column)} SET NOT NULL;`);
                    break;
                }
                case 'drop_not_null': {
                    sqlStatements.push(`ALTER TABLE ${tableRef} ALTER COLUMN ${quoteIdentifier(op.column)} DROP NOT NULL;`);
                    break;
                }
                case 'set_default': {
                    sqlStatements.push(`ALTER TABLE ${tableRef} ALTER COLUMN ${quoteIdentifier(op.column)} SET DEFAULT ${op.default_value};`);
                    break;
                }
                case 'drop_default': {
                    sqlStatements.push(`ALTER TABLE ${tableRef} ALTER COLUMN ${quoteIdentifier(op.column)} DROP DEFAULT;`);
                    break;
                }
            }
        }

        if (dry_run) {
            return {
                success: true,
                sql_statements: sqlStatements,
                message: `DRY RUN: ${sqlStatements.length} SQL statement(s) prepared but not executed.`,
            };
        }

        // Execute each statement
        context.log(`Altering table ${schema}.${table} with ${operations.length} operation(s)...`, 'info');

        for (const sql of sqlStatements) {
            const result = await executeSqlWithFallback(client, sql, false);
            if ('error' in result) {
                throw new Error(`Failed to execute: ${sql}\nError: ${result.error.message}`);
            }
        }

        return {
            success: true,
            sql_statements: sqlStatements,
            message: `Table ${schema}.${table} altered successfully with ${operations.length} operation(s).`,
        };
    },
};
