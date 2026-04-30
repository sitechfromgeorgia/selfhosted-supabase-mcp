/**
 * create_vector_index — Creates an IVFFlat or HNSW index on a vector column.
 *
 * Safety Features:
 * - IF NOT EXISTS guard
 * - Validates index method and distance metric
 * - CONCURRENTLY option for large tables
 * - Privileged tool
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';
import { validateIdentifiers, quoteIdentifier } from './ddl-utils.js';

const CreateVectorIndexInputSchema = z.object({
    schema: z.string().optional().default('public'),
    table: z.string().describe('Table name'),
    column: z.string().describe('Vector column name'),
    index_name: z.string().optional().describe('Custom index name (auto-generated if not provided)'),
    method: z.enum(['ivfflat', 'hnsw']).optional().default('hnsw'),
    distance_metric: z.enum(['l2', 'cosine', 'inner_product']).optional().default('cosine'),
    concurrently: z.boolean().optional().default(false),
    if_not_exists: z.boolean().optional().default(true),
    // IVFFlat specific
    lists: z.number().int().positive().optional().describe('IVFFlat: number of lists (default ~sqrt(rows))'),
    // HNSW specific
    ef_construction: z.number().int().positive().optional().describe('HNSW: ef_construction (default 64)'),
    ef_search: z.number().int().positive().optional().describe('HNSW: ef_search (default 40)'),
    m: z.number().int().positive().optional().describe('HNSW: M (default 16)'),
    dry_run: z.boolean().optional().default(false),
});

type CreateVectorIndexInput = z.infer<typeof CreateVectorIndexInputSchema>;

const CreateVectorIndexOutputSchema = z.object({
    success: z.boolean(),
    sql: z.string(),
    message: z.string(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        schema: { type: 'string', default: 'public' },
        table: { type: 'string' },
        column: { type: 'string' },
        index_name: { type: 'string' },
        method: { type: 'string', enum: ['ivfflat', 'hnsw'], default: 'hnsw' },
        distance_metric: { type: 'string', enum: ['l2', 'cosine', 'inner_product'], default: 'cosine' },
        concurrently: { type: 'boolean', default: false },
        if_not_exists: { type: 'boolean', default: true },
        lists: { type: 'number' },
        ef_construction: { type: 'number' },
        ef_search: { type: 'number' },
        m: { type: 'number' },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['table', 'column'],
};

export const createVectorIndexTool = {
    name: 'create_vector_index',
    description: 'Creates an IVFFlat or HNSW index on a vector column for fast similarity search.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: CreateVectorIndexInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: CreateVectorIndexOutputSchema,

    execute: async (input: CreateVectorIndexInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { schema, table, column, index_name, method, distance_metric, concurrently, if_not_exists, lists, ef_construction, ef_search, m, dry_run } = input;
        const resolvedSchema = schema || 'public';

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        validateIdentifiers([
            { name: resolvedSchema, context: 'Schema' },
            { name: table, context: 'Table' },
            { name: column, context: 'Column' },
        ]);

        const opsMap = {
            l2: 'vector_l2_ops',
            cosine: 'vector_cosine_ops',
            inner_product: 'vector_ip_ops',
        };

        const idxName = index_name || `idx_${table}_${column}_${method}`;
        validateIdentifiers([{ name: idxName, context: 'Index name' }]);

        const tableRef = `${quoteIdentifier(resolvedSchema)}.${quoteIdentifier(table)}`;

        let sql = `CREATE INDEX ${concurrently ? 'CONCURRENTLY ' : ''}${if_not_exists ? 'IF NOT EXISTS ' : ''}${quoteIdentifier(idxName)} ON ${tableRef} USING ${method} (${quoteIdentifier(column)} ${opsMap[distance_metric]})`;

        const withParams: string[] = [];
        if (method === 'ivfflat' && lists !== undefined) withParams.push(`lists = ${lists}`);
        if (method === 'hnsw') {
            if (ef_construction !== undefined) withParams.push(`ef_construction = ${ef_construction}`);
            if (m !== undefined) withParams.push(`m = ${m}`);
        }
        if (withParams.length > 0) sql += ` WITH (${withParams.join(', ')})`;
        sql += ';';

        // Set ef_search if HNSW
        let setStmt = '';
        if (method === 'hnsw' && ef_search !== undefined) {
            setStmt = `SET hnsw.ef_search = ${ef_search};`;
        }

        if (dry_run) {
            return {
                success: true,
                sql: setStmt + sql,
                message: `DRY RUN: SQL prepared but not executed.`,
            };
        }

        context.log(`Creating ${method} index on ${resolvedSchema}.${table}(${column})...`, 'info');

        if (setStmt) {
            const setResult = await client.executeSqlWithPg(setStmt);
            if ('error' in setResult) {
                throw new Error(`Failed to set ef_search: ${setResult.error.message}`);
            }
        }

        const result = await client.executeSqlWithPg(sql);

        if ('error' in result) {
            throw new Error(`Failed to create vector index: ${result.error.message}`);
        }

        return {
            success: true,
            sql: setStmt + sql,
            message: `Vector index ${idxName} created successfully on ${resolvedSchema}.${table}(${column}).`,
        };
    },
};
