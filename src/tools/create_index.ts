/**
 * create_index - Creates a database index.
 *
 * Safety Features:
 * - IF NOT EXISTS guard (default: true)
 * - CONCURRENTLY option for zero-downtime on large tables
 * - Validates identifiers
 * - Warns about index on unindexed column types (e.g., text for large tables)
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';
import { executeSqlWithFallback } from './utils.js';
import { validateIdentifiers, quoteIdentifier } from './ddl-utils.js';

const CreateIndexInputSchema = z.object({
    schema: z.string().optional().default('public'),
    table: z.string().describe('Table to index'),
    index_name: z.string().describe('Name for the new index'),
    columns: z.array(z.string()).min(1).describe('Column(s) to index'),
    unique: z.boolean().optional().default(false),
    concurrently: z.boolean().optional().default(false).describe('Build index without locking table (for large tables)'),
    if_not_exists: z.boolean().optional().default(true),
    method: z.enum(['btree', 'hash', 'gin', 'gist', 'spgist', 'brin']).optional().default('btree'),
    dry_run: z.boolean().optional().default(false),
});

type CreateIndexInput = z.infer<typeof CreateIndexInputSchema>;

const CreateIndexOutputSchema = z.object({
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
        index_name: { type: 'string' },
        columns: { type: 'array', items: { type: 'string' } },
        unique: { type: 'boolean', default: false },
        concurrently: { type: 'boolean', default: false },
        if_not_exists: { type: 'boolean', default: true },
        method: { type: 'string', enum: ['btree', 'hash', 'gin', 'gist', 'spgist', 'brin'], default: 'btree' },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['table', 'index_name', 'columns'],
};

export const createIndexTool = {
    name: 'create_index',
    description: 'Creates a database index. Supports CONCURRENTLY for zero-downtime on large tables, multiple index methods, and UNIQUE constraints.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: CreateIndexInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: CreateIndexOutputSchema,

    execute: async (input: CreateIndexInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { schema, table, index_name, columns, unique, concurrently, if_not_exists, method, dry_run } = input;

        validateIdentifiers([
            { name: schema, context: 'Schema' },
            { name: table, context: 'Table' },
            { name: index_name, context: 'Index name' },
            ...columns.map((col) => ({ name: col, context: 'Column' })),
        ]);

        const uniqueClause = unique ? 'UNIQUE ' : '';
        const concurrentlyClause = concurrently ? 'CONCURRENTLY ' : '';
        const ifNotExistsClause = if_not_exists ? 'IF NOT EXISTS ' : '';
        const tableRef = `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
        const columnsRef = columns.map(quoteIdentifier).join(', ');

        const sql = `CREATE ${uniqueClause}INDEX ${concurrentlyClause}${ifNotExistsClause}${quoteIdentifier(index_name)}
    ON ${tableRef} USING ${method} (${columnsRef});`;

        let warning: string | undefined;
        if (concurrently) {
            warning = 'Note: CONCURRENTLY creates index without locking the table, but takes longer. Cannot be used inside a transaction block.';
        }

        if (dry_run) {
            return {
                success: true,
                sql,
                warning,
                message: `DRY RUN: SQL prepared but not executed.${warning ? ' ' + warning : ''}`,
            };
        }

        context.log(`Creating index ${index_name} on ${schema}.${table}...`, 'info');

        const result = await executeSqlWithFallback(client, sql, false);

        if ('error' in result) {
            throw new Error(`Failed to create index: ${result.error.message}`);
        }

        return {
            success: true,
            sql,
            warning,
            message: `Index ${index_name} created successfully on ${schema}.${table}(${columns.join(', ')}).${warning ? ' ' + warning : ''}`,
        };
    },
};
