/**
 * upsert — Inserts rows or updates existing ones on conflict.
 *
 * Uses INSERT ... ON CONFLICT DO UPDATE.
 * Privileged tool.
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';
import { validateIdentifiers, quoteIdentifier } from './ddl-utils.js';

const UpsertInputSchema = z.object({
    schema: z.string().optional().default('public'),
    table: z.string().describe('Target table'),
    data: z.record(z.any()).describe('Row data to insert'),
    conflict_columns: z.array(z.string()).min(1).describe('Columns to detect conflict on'),
    update_columns: z.array(z.string()).optional().describe('Columns to update on conflict (omit for all)'),
    dry_run: z.boolean().optional().default(false),
});

type UpsertInput = z.infer<typeof UpsertInputSchema>;

const UpsertOutputSchema = z.object({
    success: z.boolean(),
    message: z.string(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        schema: { type: 'string', default: 'public' },
        table: { type: 'string' },
        data: { type: 'object' },
        conflict_columns: { type: 'array', items: { type: 'string' } },
        update_columns: { type: 'array', items: { type: 'string' } },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['table', 'data', 'conflict_columns'],
};

export const upsertTool = {
    name: 'upsert',
    description: 'Inserts a row or updates existing data on conflict (INSERT ... ON CONFLICT DO UPDATE).',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: UpsertInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: UpsertOutputSchema,

    execute: async (input: UpsertInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { schema, table, data, conflict_columns, update_columns, dry_run } = input;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        const columns = Object.keys(data);
        validateIdentifiers([
            { name: schema, context: 'Schema' },
            { name: table, context: 'Table' },
            ...columns.map((c) => ({ name: c, context: 'Column' })),
            ...conflict_columns.map((c) => ({ name: c, context: 'Conflict column' })),
        ]);

        const tableRef = `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
        const colList = columns.map(quoteIdentifier).join(', ');

        const placeholders: string[] = [];
        const values: any[] = [];
        let idx = 1;

        for (const col of columns) {
            placeholders.push(`$${idx++}`);
            values.push(data[col]);
        }

        const conflictList = conflict_columns.map(quoteIdentifier).join(', ');

        const updateCols = update_columns || columns.filter((c) => !conflict_columns.includes(c));
        const updateClause = updateCols.length > 0
            ? updateCols.map((c) => `${quoteIdentifier(c)} = EXCLUDED.${quoteIdentifier(c)}`).join(', ')
            : 'NOTHING';

        let sql: string;
        if (updateClause === 'NOTHING') {
            sql = `INSERT INTO ${tableRef} (${colList}) VALUES (${placeholders.join(', ')}) ON CONFLICT (${conflictList}) DO NOTHING;`;
        } else {
            sql = `INSERT INTO ${tableRef} (${colList}) VALUES (${placeholders.join(', ')}) ON CONFLICT (${conflictList}) DO UPDATE SET ${updateClause};`;
        }

        if (dry_run) {
            return {
                success: true,
                message: `DRY RUN: Would upsert into ${schema}.${table} on conflict (${conflictList}).`,
            };
        }

        context.log(`Upserting into ${schema}.${table}...`, 'info');

        const result = await client.executeSqlWithPg(sql, values);

        if ('error' in result) {
            throw new Error(`Upsert failed: ${result.error.message}`);
        }

        return {
            success: true,
            message: `Upsert completed successfully on ${schema}.${table}.`,
        };
    },
};
