/**
 * drop_foreign_key - Removes a foreign key constraint from a table.
 *
 * Safety Features:
 * - Validates identifiers
 * - CASCADE option
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';
import { executeSqlWithFallback } from './utils.js';
import { validateIdentifiers, quoteIdentifier } from './ddl-utils.js';

const DropForeignKeyInputSchema = z.object({
    schema: z.string().optional().default('public'),
    table: z.string().describe('Table containing the constraint'),
    constraint_name: z.string().describe('Name of the foreign key constraint to drop'),
    cascade: z.boolean().optional().default(false),
    dry_run: z.boolean().optional().default(false),
});

type DropForeignKeyInput = z.infer<typeof DropForeignKeyInputSchema>;

const DropForeignKeyOutputSchema = z.object({
    success: z.boolean(),
    sql: z.string(),
    message: z.string(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        schema: { type: 'string', default: 'public' },
        table: { type: 'string' },
        constraint_name: { type: 'string' },
        cascade: { type: 'boolean', default: false },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['table', 'constraint_name'],
};

export const dropForeignKeyTool = {
    name: 'drop_foreign_key',
    description: 'Drops a foreign key constraint from a table.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: DropForeignKeyInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: DropForeignKeyOutputSchema,

    execute: async (input: DropForeignKeyInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { schema, table, constraint_name, cascade, dry_run } = input;

        validateIdentifiers([
            { name: schema, context: 'Schema' },
            { name: table, context: 'Table' },
            { name: constraint_name, context: 'Constraint name' },
        ]);

        const tableRef = `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
        const cascadeClause = cascade ? ' CASCADE' : '';

        const sql = `ALTER TABLE ${tableRef} DROP CONSTRAINT ${quoteIdentifier(constraint_name)}${cascadeClause};`;

        if (dry_run) {
            return {
                success: true,
                sql,
                message: 'DRY RUN: SQL prepared but not executed.',
            };
        }

        context.log(`Dropping foreign key ${constraint_name} from ${schema}.${table}...`, 'info');

        const result = await executeSqlWithFallback(client, sql, false);

        if ('error' in result) {
            throw new Error(`Failed to drop foreign key: ${result.error.message}`);
        }

        return {
            success: true,
            sql,
            message: `Foreign key constraint ${constraint_name} dropped successfully from ${schema}.${table}.`,
        };
    },
};
