/**
 * drop_index - Removes a database index.
 *
 * Safety Features:
 * - IF EXISTS guard (default: true)
 * - CONCURRENTLY option for zero-downtime removal
 * - Validates identifiers
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';
import { executeSqlWithFallback } from './utils.js';
import { validateIdentifiers, quoteIdentifier } from './ddl-utils.js';

const DropIndexInputSchema = z.object({
    schema: z.string().optional().default('public'),
    index_name: z.string().describe('Index to drop'),
    if_exists: z.boolean().optional().default(true),
    concurrently: z.boolean().optional().default(false),
    cascade: z.boolean().optional().default(false),
    dry_run: z.boolean().optional().default(false),
});

type DropIndexInput = z.infer<typeof DropIndexInputSchema>;

const DropIndexOutputSchema = z.object({
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
        cascade: { type: 'boolean', default: false },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['index_name'],
};

export const dropIndexTool = {
    name: 'drop_index',
    description: 'Drops a database index. Supports CONCURRENTLY for zero-downtime removal on large tables.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: DropIndexInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: DropIndexOutputSchema,

    execute: async (input: DropIndexInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { schema, index_name, if_exists, concurrently, cascade, dry_run } = input;

        validateIdentifiers([
            { name: schema, context: 'Schema' },
            { name: index_name, context: 'Index name' },
        ]);

        const concurrentlyClause = concurrently ? 'CONCURRENTLY ' : '';
        const ifExistsClause = if_exists ? 'IF EXISTS ' : '';
        const cascadeClause = cascade ? ' CASCADE' : '';

        const sql = `DROP INDEX ${concurrentlyClause}${ifExistsClause}${quoteIdentifier(schema)}.${quoteIdentifier(index_name)}${cascadeClause};`;

        if (dry_run) {
            return {
                success: true,
                sql,
                message: 'DRY RUN: SQL prepared but not executed.',
            };
        }

        context.log(`Dropping index ${schema}.${index_name}...`, 'info');

        const result = await executeSqlWithFallback(client, sql, false);

        if ('error' in result) {
            throw new Error(`Failed to drop index: ${result.error.message}`);
        }

        return {
            success: true,
            sql,
            message: `Index ${schema}.${index_name} dropped successfully.`,
        };
    },
};
