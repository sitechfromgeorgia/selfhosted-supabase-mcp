/**
 * bulk_delete — Deletes rows matching a WHERE condition.
 *
 * Safety Features:
 * - WHERE clause is mandatory (no full table deletes)
 * - Validates identifiers
 * - Dry-run preview shows row count
 * - Privileged tool
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';
import { validateIdentifiers, quoteIdentifier } from './ddl-utils.js';

const BulkDeleteInputSchema = z.object({
    schema: z.string().optional().default('public'),
    table: z.string().describe('Table to delete from'),
    where: z.string().min(1).describe('WHERE clause (required)'),
    limit: z.number().int().positive().optional().describe('Maximum rows to delete'),
    dry_run: z.boolean().optional().default(false),
});

type BulkDeleteInput = z.infer<typeof BulkDeleteInputSchema>;

const BulkDeleteOutputSchema = z.object({
    success: z.boolean(),
    message: z.string(),
    deleted_count: z.number(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        schema: { type: 'string', default: 'public' },
        table: { type: 'string' },
        where: { type: 'string' },
        limit: { type: 'number' },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['table', 'where'],
};

export const bulkDeleteTool = {
    name: 'bulk_delete',
    description: 'Deletes rows matching a WHERE condition. WHERE is mandatory — full table deletes are not allowed.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: BulkDeleteInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: BulkDeleteOutputSchema,

    execute: async (input: BulkDeleteInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { schema, table, where, limit, dry_run } = input;
        const resolvedSchema = schema || 'public';

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        validateIdentifiers([
            { name: resolvedSchema, context: 'Schema' },
            { name: table, context: 'Table' },
        ]);

        const tableRef = `${quoteIdentifier(resolvedSchema)}.${quoteIdentifier(table)}`;

        // Preview count in dry-run
        if (dry_run) {
            const countResult = await client.executeSqlWithPg(
                `SELECT COUNT(*) as cnt FROM ${tableRef} WHERE ${where}`
            );
            const count = ('error' in countResult)
                ? 0
                : parseInt((countResult as any[])[0]?.cnt || '0', 10);

            return {
                success: true,
                message: `DRY RUN: Would delete ${count} rows from ${schema}.${table} where ${where}${limit ? ' (limited to ' + limit + ')' : ''}.`,
                deleted_count: 0,
            };
        }

        context.log(`Bulk deleting from ${schema}.${table}...`, 'info');

        let sql = `DELETE FROM ${tableRef} WHERE ${where}`;
        if (limit) {
            sql += ` LIMIT ${limit}`;
        }
        sql += ' RETURNING id;';

        const result = await client.executeSqlWithPg(sql);

        if ('error' in result) {
            throw new Error(`Bulk delete failed: ${result.error.message}`);
        }

        const count = (result as any[]).length;

        return {
            success: true,
            message: `${count} row(s) deleted from ${schema}.${table}.`,
            deleted_count: count,
        };
    },
};
