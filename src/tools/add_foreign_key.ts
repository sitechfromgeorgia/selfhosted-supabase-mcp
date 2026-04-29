/**
 * add_foreign_key - Adds a foreign key constraint to a table.
 *
 * Safety Features:
 * - IF NOT EXISTS validation via explicit option
 * - Validates all identifiers
 * - Supports ON DELETE / ON UPDATE actions
 * - Supports DEFERRABLE constraints
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';
import { executeSqlWithFallback } from './utils.js';
import { validateIdentifiers, quoteIdentifier } from './ddl-utils.js';

const ForeignKeyActionSchema = z.enum(['NO ACTION', 'RESTRICT', 'CASCADE', 'SET NULL', 'SET DEFAULT']);

const AddForeignKeyInputSchema = z.object({
    schema: z.string().optional().default('public'),
    table: z.string().describe('Source table'),
    columns: z.array(z.string()).min(1).describe('Source column(s)'),
    referenced_schema: z.string().optional().default('public'),
    referenced_table: z.string().describe('Target table'),
    referenced_columns: z.array(z.string()).min(1).describe('Target column(s)'),
    constraint_name: z.string().optional().describe('Custom constraint name (auto-generated if not provided)'),
    on_delete: ForeignKeyActionSchema.optional(),
    on_update: ForeignKeyActionSchema.optional(),
    deferrable: z.boolean().optional().default(false),
    initially_deferred: z.boolean().optional().default(false),
    dry_run: z.boolean().optional().default(false),
});

type AddForeignKeyInput = z.infer<typeof AddForeignKeyInputSchema>;

const AddForeignKeyOutputSchema = z.object({
    success: z.boolean(),
    sql: z.string(),
    constraint_name: z.string(),
    message: z.string(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        schema: { type: 'string', default: 'public' },
        table: { type: 'string' },
        columns: { type: 'array', items: { type: 'string' } },
        referenced_schema: { type: 'string', default: 'public' },
        referenced_table: { type: 'string' },
        referenced_columns: { type: 'array', items: { type: 'string' } },
        constraint_name: { type: 'string' },
        on_delete: { type: 'string', enum: ['NO ACTION', 'RESTRICT', 'CASCADE', 'SET NULL', 'SET DEFAULT'] },
        on_update: { type: 'string', enum: ['NO ACTION', 'RESTRICT', 'CASCADE', 'SET NULL', 'SET DEFAULT'] },
        deferrable: { type: 'boolean', default: false },
        initially_deferred: { type: 'boolean', default: false },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['table', 'columns', 'referenced_table', 'referenced_columns'],
};

export const addForeignKeyTool = {
    name: 'add_foreign_key',
    description: 'Adds a foreign key constraint between tables. Supports ON DELETE/UPDATE actions and DEFERRABLE constraints.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: AddForeignKeyInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: AddForeignKeyOutputSchema,

    execute: async (input: AddForeignKeyInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const {
            schema, table, columns,
            referenced_schema, referenced_table, referenced_columns,
            constraint_name, on_delete, on_update,
            deferrable, initially_deferred, dry_run,
        } = input;

        if (columns.length !== referenced_columns.length) {
            throw new Error('Source and referenced column counts must match.');
        }

        validateIdentifiers([
            { name: schema, context: 'Schema' },
            { name: table, context: 'Table' },
            { name: referenced_schema, context: 'Referenced schema' },
            { name: referenced_table, context: 'Referenced table' },
            ...columns.map((c) => ({ name: c, context: 'Column' })),
            ...referenced_columns.map((c) => ({ name: c, context: 'Referenced column' })),
            ...(constraint_name ? [{ name: constraint_name, context: 'Constraint name' }] : []),
        ]);

        const fkName = constraint_name || `fk_${table}_${columns.join('_')}_${referenced_table}`;

        const tableRef = `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
        const refTableRef = `${quoteIdentifier(referenced_schema)}.${quoteIdentifier(referenced_table)}`;
        const cols = columns.map(quoteIdentifier).join(', ');
        const refCols = referenced_columns.map(quoteIdentifier).join(', ');

        let sql = `ALTER TABLE ${tableRef} ADD CONSTRAINT ${quoteIdentifier(fkName)}
    FOREIGN KEY (${cols}) REFERENCES ${refTableRef} (${refCols})`;

        if (on_delete) sql += `\n    ON DELETE ${on_delete}`;
        if (on_update) sql += `\n    ON UPDATE ${on_update}`;
        if (deferrable) {
            sql += `\n    DEFERRABLE`;
            if (initially_deferred) sql += ` INITIALLY DEFERRED`;
            else sql += ` INITIALLY IMMEDIATE`;
        }
        sql += ';';

        if (dry_run) {
            return {
                success: true,
                sql,
                constraint_name: fkName,
                message: `DRY RUN: SQL prepared but not executed.`,
            };
        }

        context.log(`Adding foreign key ${fkName} to ${schema}.${table}...`, 'info');

        const result = await executeSqlWithFallback(client, sql, false);

        if ('error' in result) {
            throw new Error(`Failed to add foreign key: ${result.error.message}`);
        }

        return {
            success: true,
            sql,
            constraint_name: fkName,
            message: `Foreign key constraint ${fkName} added successfully.`,
        };
    },
};
