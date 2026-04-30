/**
 * drop_vector_index — Removes a vector index.
 *
 * Safety Features:
 * - IF EXISTS guard
 * - CONCURRENTLY option
 * - Validates identifiers
 * - Privileged tool
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';
import { validateIdentifiers, quoteIdentifier } from './ddl-utils.js';

const DropVectorIndexInputSchema = z.object({
    schema: z.string().optional().default('public'),
    index_name: z.string().describe('Index to drop'),
    if_exists: z.boolean().optional().default(true),
    concurrently: z.boolean().optional().default(false),
    dry_run: z.boolean().optional().default(false),
});

type DropVectorIndexInput = z.infer<typeof DropVectorIndexInputSchema>;

const DropVectorIndexOutputSchema = z.object({
    success: z.boolean(),
    sql: z.string(),
    message: z.string(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        schema: { type: 'string', default: 'public' },
        index_name: { type: 'string' },
        if_exists: { type: 'boolean', default: true },
        concurrently: { type: 'boolean', default: false },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['index_name'],
};

export const dropVectorIndexTool = {
    name: 'drop_vector_index',
    description: 'Drops a vector index (IVFFlat or HNSW). Supports CONCURRENTLY for large tables.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: DropVectorIndexInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: DropVectorIndexOutputSchema,

    execute: async (input: DropVectorIndexInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { schema, index_name, if_exists, concurrently, dry_run } = input;
        const resolvedSchema = schema || 'public';

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        validateIdentifiers([
            { name: resolvedSchema, context: 'Schema' },
            { name: index_name, context: 'Index name' },
        ]);

        const concurrentlyClause = concurrently ? 'CONCURRENTLY ' : '';
        const ifExistsClause = if_exists ? 'IF EXISTS ' : '';

        const sql = `DROP INDEX ${concurrentlyClause}${ifExistsClause}${quoteIdentifier(resolvedSchema)}.${quoteIdentifier(index_name)};`;

        if (dry_run) {
            return {
                success: true,
                sql,
                message: 'DRY RUN: SQL prepared but not executed.',
            };
        }

        context.log(`Dropping vector index ${schema}.${index_name}...`, 'info');

        const result = await client.executeSqlWithPg(sql);

        if ('error' in result) {
            throw new Error(`Failed to drop vector index: ${result.error.message}`);
        }

        return {
            success: true,
            sql,
            message: `Vector index ${schema}.${index_name} dropped successfully.`,
        };
    },
};
