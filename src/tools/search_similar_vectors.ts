/**
 * search_similar_vectors — Performs K-nearest neighbor search on a vector column.
 *
 * Supports L2, cosine, and inner product distance metrics.
 * Regular tool (read-only).
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';
import { validateIdentifiers, quoteIdentifier } from './ddl-utils.js';

const DistanceMetricSchema = z.enum(['l2', 'cosine', 'inner_product']);

const SearchSimilarVectorsInputSchema = z.object({
    schema: z.string().optional().default('public'),
    table: z.string().describe('Table containing vectors'),
    column: z.string().describe('Vector column name'),
    query_vector: z.array(z.number()).describe('Query embedding array (e.g., [0.1, 0.2, ...])'),
    top_k: z.number().int().positive().max(1000).optional().default(10),
    distance_metric: DistanceMetricSchema.optional().default('cosine'),
    filters: z.record(z.any()).optional().describe('Additional WHERE clause filters (JSON)'),
    include_vector: z.boolean().optional().default(false).describe('Include the vector in results'),
    dry_run: z.boolean().optional().default(false),
});

type SearchSimilarVectorsInput = z.infer<typeof SearchSimilarVectorsInputSchema>;

const SearchSimilarVectorsOutputSchema = z.object({
    success: z.boolean(),
    results: z.array(z.record(z.any())),
    count: z.number(),
    distance_metric: z.string(),
    query_dimensions: z.number(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        schema: { type: 'string', default: 'public' },
        table: { type: 'string' },
        column: { type: 'string' },
        query_vector: { type: 'array', items: { type: 'number' } },
        top_k: { type: 'number', default: 10 },
        distance_metric: { type: 'string', enum: ['l2', 'cosine', 'inner_product'], default: 'cosine' },
        filters: { type: 'object' },
        include_vector: { type: 'boolean', default: false },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['table', 'column', 'query_vector'],
};

export const searchSimilarVectorsTool = {
    name: 'search_similar_vectors',
    description: 'K-nearest neighbor vector search. Supports L2, cosine, and inner product distances.',
    privilegeLevel: 'regular' as ToolPrivilegeLevel,
    inputSchema: SearchSimilarVectorsInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: SearchSimilarVectorsOutputSchema,

    execute: async (input: SearchSimilarVectorsInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { schema, table, column, query_vector, top_k, distance_metric, filters, include_vector, dry_run } = input;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required for vector search.');
        }

        validateIdentifiers([
            { name: schema, context: 'Schema' },
            { name: table, context: 'Table' },
            { name: column, context: 'Column' },
        ]);

        const tableRef = `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
        const vectorLiteral = `'[${query_vector.join(',')}]'`;

        const operatorMap = {
            l2: '<->',
            cosine: '<=>',
            inner_product: '<#>',
        };
        const operator = operatorMap[distance_metric];

        const selectCols = include_vector
            ? '*'
            : `*, ${quoteIdentifier(column)}::text as vector_text`;

        let sql = `SELECT ${selectCols}, ${quoteIdentifier(column)} ${operator} ${vectorLiteral} AS distance FROM ${tableRef}`;

        const params: any[] = [];
        let paramIdx = 1;

        // Simple JSON filter support
        if (filters && Object.keys(filters).length > 0) {
            const conditions: string[] = [];
            for (const [key, value] of Object.entries(filters)) {
                validateIdentifiers([{ name: key, context: 'Filter column' }]);
                conditions.push(`${quoteIdentifier(key)} = $${paramIdx++}`);
                params.push(value);
            }
            sql += ` WHERE ${conditions.join(' AND ')}`;
        }

        sql += ` ORDER BY ${quoteIdentifier(column)} ${operator} ${vectorLiteral}`;
        sql += ` LIMIT $${paramIdx++}`;
        params.push(top_k);
        sql += ';';

        if (dry_run) {
            return {
                success: true,
                results: [],
                count: 0,
                distance_metric,
                query_dimensions: query_vector.length,
            };
        }

        context.log(`Searching ${top_k} nearest neighbors in ${schema}.${table}...`, 'info');

        const result = await client.executeSqlWithPg(sql, params);

        if ('error' in result) {
            throw new Error(`Vector search failed: ${result.error.message}`);
        }

        const rows = result as any[];

        return {
            success: true,
            results: rows,
            count: rows.length,
            distance_metric,
            query_dimensions: query_vector.length,
        };
    },
};
