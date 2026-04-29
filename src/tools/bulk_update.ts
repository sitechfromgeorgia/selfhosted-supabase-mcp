/**
 * bulk_update — Updates multiple rows matching a WHERE condition.
 *
 * Safety Features:
 * - WHERE clause is mandatory
 * - Validates identifiers
 * - Privileged tool
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';
import { validateIdentifiers, quoteIdentifier } from './ddl-utils.js';

const BulkUpdateInputSchema = z.object({
    schema: z.string().optional().default('public'),
    table: z.string().describe('Table to update'),
    set: z.record(z.any()).describe('Column values to set'),
    where: z.string().min(1).describe('WHERE clause (required for safety)'),
    dry_run: z.boolean().optional().default(false),
});

type BulkUpdateInput = z.infer<typeof BulkUpdateInputSchema>;

const BulkUpdateOutputSchema = z.object({
    success: z.boolean(),
    message: z.string(),
    updated_count: z.number(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        schema: { type: 'string', default: 'public' },
        table: { type: 'string' },
        set: { type: 'object' },
        where: { type: 'string' },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['table', 'set', 'where'],
};

export const bulkUpdateTool = {
    name: 'bulk_update',
    description: 'Updates rows matching a WHERE condition. WHERE clause is mandatory for safety.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: BulkUpdateInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: BulkUpdateOutputSchema,

    execute: async (input: BulkUpdateInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { schema, table, set, where, dry_run } = input;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        validateIdentifiers([
            { name: schema, context: 'Schema' },
            { name: table, context: 'Table' },
            ...Object.keys(set).map((c) => ({ name: c, context: 'Column' })),
        ]);

        const tableRef = `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
        const sets = Object.keys(set).map((col) => `${quoteIdentifier(col)} = $1`).join(', ');
        // Note: This simple implementation uses $1 for all values which won't work correctly for multiple columns
        // Let me fix this to use proper parameterization

        const setEntries = Object.entries(set);
        const setClause = setEntries.map((_, i) => `${quoteIdentifier(setEntries[i][0])} = $${i + 1}`).join(', ');
        const values = setEntries.map(([, val]) => val);

        const sql = `UPDATE ${tableRef} SET ${setClause} WHERE ${where} RETURNING id;`;

        if (dry_run) {
            return {
                success: true,
                message: `DRY RUN: Would update rows in ${schema}.${table} where ${where}.`,
                updated_count: 0,
            };
        }

        context.log(`Bulk updating ${schema}.${table}...`, 'info');

        const result = await client.executeSqlWithPg(sql, values);

        if ('error' in result) {
            throw new Error(`Bulk update failed: ${result.error.message}`);
        }

        const count = (result as any[]).length;

        return {
            success: true,
            message: `${count} row(s) updated in ${schema}.${table}.`,
            updated_count: count,
        };
    },
};
