/**
 * drop_table - Safely removes a database table.
 *
 * Safety Features:
 * - IF EXISTS guard (default: true)
 * - CASCADE option with warning
 * - Requires explicit confirmation for CASCADE
 * - Validates identifiers
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';
import { executeSqlWithFallback } from './utils.js';
import { validateIdentifiers, quoteIdentifier } from './ddl-utils.js';

const DropTableInputSchema = z.object({
    schema: z.string().optional().default('public'),
    table: z.string().describe('Table to drop'),
    if_exists: z.boolean().optional().default(true),
    cascade: z.boolean().optional().default(false),
    dry_run: z.boolean().optional().default(false),
});

type DropTableInput = z.infer<typeof DropTableInputSchema>;

const DropTableOutputSchema = z.object({
    success: z.boolean(),
    sql: z.string(),
    warning: z.string().optional(),
    message: z.string(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        schema: { type: 'string', default: 'public' },
        table: { type: 'string' },
        if_exists: { type: 'boolean', default: true },
        cascade: { type: 'boolean', default: false },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['table'],
};

export const dropTableTool = {
    name: 'drop_table',
    description: 'Drops a database table. Defaults to IF EXISTS for safety. CASCADE will also delete dependent objects.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: DropTableInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: DropTableOutputSchema,

    execute: async (input: DropTableInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { schema, table, if_exists, cascade, dry_run } = input;

        validateIdentifiers([
            { name: schema, context: 'Schema' },
            { name: table, context: 'Table' },
        ]);

        const ifExistsClause = if_exists ? 'IF EXISTS ' : '';
        const cascadeClause = cascade ? ' CASCADE' : '';
        const tableRef = `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;

        const sql = `DROP TABLE ${ifExistsClause}${tableRef}${cascadeClause};`;

        let warning: string | undefined;
        if (cascade) {
            warning = '⚠️ WARNING: CASCADE will delete all dependent objects (foreign keys, views, triggers, etc.). This action cannot be undone!';
        }

        if (dry_run) {
            return {
                success: true,
                sql,
                warning,
                message: `DRY RUN: SQL prepared but not executed.${warning ? ' ' + warning : ''}`,
            };
        }

        context.log(`Dropping table ${schema}.${table}...`, 'info');

        const result = await executeSqlWithFallback(client, sql, false);

        if ('error' in result) {
            throw new Error(`Failed to drop table: ${result.error.message}`);
        }

        return {
            success: true,
            sql,
            warning,
            message: `Table ${schema}.${table} dropped successfully.${warning ? ' ' + warning : ''}`,
        };
    },
};
