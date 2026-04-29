/**
 * export_table — Exports a table to CSV or JSON format.
 *
 * Supports column selection, WHERE filtering, and row limits.
 * Regular tool.
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';
import { validateIdentifiers, quoteIdentifier } from './ddl-utils.js';

const ExportTableInputSchema = z.object({
    schema: z.string().optional().default('public'),
    table: z.string().describe('Table to export'),
    format: z.enum(['csv', 'json']).optional().default('csv'),
    columns: z.array(z.string()).optional().describe('Columns to export (omit for all)'),
    where: z.string().optional().describe('WHERE clause filter'),
    limit: z.number().int().positive().max(10000).optional().default(1000),
    include_header: z.boolean().optional().default(true),
});

type ExportTableInput = z.infer<typeof ExportTableInputSchema>;

const ExportTableOutputSchema = z.object({
    success: z.boolean(),
    content: z.string(),
    row_count: z.number(),
    format: z.string(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        schema: { type: 'string', default: 'public' },
        table: { type: 'string' },
        format: { type: 'string', enum: ['csv', 'json'], default: 'csv' },
        columns: { type: 'array', items: { type: 'string' } },
        where: { type: 'string' },
        limit: { type: 'number', default: 1000 },
        include_header: { type: 'boolean', default: true },
    },
    required: ['table'],
};

export const exportTableTool = {
    name: 'export_table',
    description: 'Exports a table to CSV or JSON format with optional filtering and column selection.',
    privilegeLevel: 'regular' as ToolPrivilegeLevel,
    inputSchema: ExportTableInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: ExportTableOutputSchema,

    execute: async (input: ExportTableInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { schema, table, format, columns, where, limit, include_header } = input;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        validateIdentifiers([
            { name: schema, context: 'Schema' },
            { name: table, context: 'Table' },
            ...(columns || []).map((c) => ({ name: c, context: 'Column' })),
        ]);

        const tableRef = `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
        const colList = columns ? columns.map(quoteIdentifier).join(', ') : '*';

        let sql = `SELECT ${colList} FROM ${tableRef}`;
        if (where) sql += ` WHERE ${where}`;
        sql += ` LIMIT ${limit}`;

        context.log(`Exporting ${schema}.${table} as ${format}...`, 'info');

        const result = await client.executeSqlWithPg(sql);

        if ('error' in result) {
            throw new Error(`Export failed: ${result.error.message}`);
        }

        const rows = result as any[];

        if (format === 'json') {
            return {
                success: true,
                content: JSON.stringify(rows, null, 2),
                row_count: rows.length,
                format: 'json',
            };
        }

        // CSV format
        const allColumns = columns || (rows.length > 0 ? Object.keys(rows[0]) : []);
        let csv = '';

        if (include_header) {
            csv += allColumns.join(',') + '\n';
        }

        for (const row of rows) {
            const values = allColumns.map((col) => {
                const val = row[col];
                if (val === null || val === undefined) return '';
                const str = String(val);
                // Escape quotes and wrap in quotes if contains comma or quote
                if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                    return '"' + str.replace(/"/g, '""') + '"';
                }
                return str;
            });
            csv += values.join(',') + '\n';
        }

        return {
            success: true,
            content: csv,
            row_count: rows.length,
            format: 'csv',
        };
    },
};
