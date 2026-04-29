/**
 * bulk_insert — Inserts multiple rows into a table in a single statement.
 *
 * Safety Features:
 * - Max batch size limit (1000)
 * - Validates table/column identifiers
 * - Returns inserted row count
 * - Privileged tool
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';
import { validateIdentifiers, quoteIdentifier } from './ddl-utils.js';

const MAX_BATCH_SIZE = 1000;

const BulkInsertInputSchema = z.object({
    schema: z.string().optional().default('public'),
    table: z.string().describe('Target table'),
    rows: z.array(z.record(z.any())).min(1).max(MAX_BATCH_SIZE),
    on_conflict: z.string().optional().describe('ON CONFLICT clause (e.g., "DO NOTHING" or "DO UPDATE SET...")'),
    dry_run: z.boolean().optional().default(false),
});

type BulkInsertInput = z.infer<typeof BulkInsertInputSchema>;

const BulkInsertOutputSchema = z.object({
    success: z.boolean(),
    message: z.string(),
    inserted_count: z.number(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        schema: { type: 'string', default: 'public' },
        table: { type: 'string' },
        rows: { type: 'array', items: { type: 'object' } },
        on_conflict: { type: 'string' },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['table', 'rows'],
};

export const bulkInsertTool = {
    name: 'bulk_insert',
    description: `Inserts up to ${MAX_BATCH_SIZE} rows into a table in a single statement. Supports ON CONFLICT.`,
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: BulkInsertInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: BulkInsertOutputSchema,

    execute: async (input: BulkInsertInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { schema, table, rows, on_conflict, dry_run } = input;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        validateIdentifiers([
            { name: schema, context: 'Schema' },
            { name: table, context: 'Table' },
        ]);

        if (rows.length === 0) {
            throw new Error('No rows to insert.');
        }

        const columns = Object.keys(rows[0]);
        validateIdentifiers(columns.map((c) => ({ name: c, context: 'Column' })));

        const tableRef = `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
        const colList = columns.map(quoteIdentifier).join(', ');

        // Build value placeholders
        const placeholders: string[] = [];
        const values: any[] = [];
        let idx = 1;

        for (const row of rows) {
            const rowPlaceholders: string[] = [];
            for (const col of columns) {
                rowPlaceholders.push(`$${idx++}`);
                values.push(row[col]);
            }
            placeholders.push(`(${rowPlaceholders.join(', ')})`);
        }

        let sql = `INSERT INTO ${tableRef} (${colList}) VALUES ${placeholders.join(', ')}`;
        if (on_conflict) {
            sql += ` ON CONFLICT ${on_conflict}`;
        }
        sql += ';';

        if (dry_run) {
            return {
                success: true,
                message: `DRY RUN: Would insert ${rows.length} rows into ${schema}.${table}.`,
                inserted_count: 0,
            };
        }

        context.log(`Bulk inserting ${rows.length} rows into ${schema}.${table}...`, 'info');

        const result = await client.executeSqlWithPg(sql, values);

        if ('error' in result) {
            throw new Error(`Bulk insert failed: ${result.error.message}`);
        }

        return {
            success: true,
            message: `${rows.length} rows inserted into ${schema}.${table}.`,
            inserted_count: rows.length,
        };
    },
};
