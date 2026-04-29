/**
 * analyze_table — Updates table statistics for query planner optimization.
 *
 * Can run on specific columns or entire table.
 * Privileged tool.
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';
import { validateIdentifiers, quoteIdentifier } from './ddl-utils.js';

const AnalyzeTableInputSchema = z.object({
    schema: z.string().optional().default('public'),
    table: z.string().describe('Table to analyze'),
    columns: z.array(z.string()).optional().describe('Specific columns to analyze (omit for all)'),
    dry_run: z.boolean().optional().default(false),
});

type AnalyzeTableInput = z.infer<typeof AnalyzeTableInputSchema>;

const AnalyzeTableOutputSchema = z.object({
    success: z.boolean(),
    sql: z.string(),
    message: z.string(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        schema: { type: 'string', default: 'public' },
        table: { type: 'string' },
        columns: { type: 'array', items: { type: 'string' } },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['table'],
};

export const analyzeTableTool = {
    name: 'analyze_table',
    description: 'Updates statistics for the query planner. Run after bulk inserts or schema changes.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: AnalyzeTableInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: AnalyzeTableOutputSchema,

    execute: async (input: AnalyzeTableInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { schema, table, columns, dry_run } = input;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        validateIdentifiers([
            { name: schema, context: 'Schema' },
            { name: table, context: 'Table' },
            ...(columns || []).map((c) => ({ name: c, context: 'Column' })),
        ]);

        let sql = `ANALYZE ${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
        if (columns && columns.length > 0) {
            sql += `(${columns.map(quoteIdentifier).join(', ')})`;
        }
        sql += ';';

        if (dry_run) {
            return {
                success: true,
                sql,
                message: 'DRY RUN: SQL prepared but not executed.',
            };
        }

        context.log(`Analyzing ${schema}.${table}...`, 'info');

        const result = await client.executeSqlWithPg(sql);

        if ('error' in result) {
            throw new Error(`ANALYZE failed: ${result.error.message}`);
        }

        return {
            success: true,
            sql,
            message: `ANALYZE completed successfully on ${schema}.${table}${columns ? ' (' + columns.join(', ') + ')' : ''}.`,
        };
    },
};
