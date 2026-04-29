/**
 * create_schema - Creates a new database schema.
 *
 * Safety Features:
 * - IF NOT EXISTS guard (default: true)
 * - Validates identifier
 * - Privileged tool
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';
import { executeSqlWithFallback } from './utils.js';
import { validateIdentifiers, quoteIdentifier } from './ddl-utils.js';

const CreateSchemaInputSchema = z.object({
    schema: z.string().describe('Schema name to create'),
    if_not_exists: z.boolean().optional().default(true),
    dry_run: z.boolean().optional().default(false),
});

type CreateSchemaInput = z.infer<typeof CreateSchemaInputSchema>;

const CreateSchemaOutputSchema = z.object({
    success: z.boolean(),
    sql: z.string(),
    message: z.string(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        schema: { type: 'string' },
        if_not_exists: { type: 'boolean', default: true },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['schema'],
};

export const createSchemaTool = {
    name: 'create_schema',
    description: 'Creates a new database schema. Defaults to IF NOT EXISTS for safety.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: CreateSchemaInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: CreateSchemaOutputSchema,

    execute: async (input: CreateSchemaInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { schema, if_not_exists, dry_run } = input;

        validateIdentifiers([{ name: schema, context: 'Schema' }]);

        const ifNotExistsClause = if_not_exists ? 'IF NOT EXISTS ' : '';
        const sql = `CREATE SCHEMA ${ifNotExistsClause}${quoteIdentifier(schema)};`;

        if (dry_run) {
            return {
                success: true,
                sql,
                message: `DRY RUN: SQL prepared but not executed.`,
            };
        }

        context.log(`Creating schema ${schema}...`, 'info');

        const result = await executeSqlWithFallback(client, sql, false);

        if ('error' in result) {
            throw new Error(`Failed to create schema: ${result.error.message}`);
        }

        return {
            success: true,
            sql,
            message: `Schema ${schema} created successfully.`,
        };
    },
};
