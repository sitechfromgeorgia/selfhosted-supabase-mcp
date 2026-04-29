/**
 * drop_schema - Drops a database schema.
 *
 * Safety Features:
 * - IF EXISTS guard (default: true)
 * - CASCADE option with warning
 * - Validates identifier
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';
import { executeSqlWithFallback } from './utils.js';
import { validateIdentifiers, quoteIdentifier } from './ddl-utils.js';

const DropSchemaInputSchema = z.object({
    schema: z.string().describe('Schema to drop'),
    if_exists: z.boolean().optional().default(true),
    cascade: z.boolean().optional().default(false),
    dry_run: z.boolean().optional().default(false),
});

type DropSchemaInput = z.infer<typeof DropSchemaInputSchema>;

const DropSchemaOutputSchema = z.object({
    success: z.boolean(),
    sql: z.string(),
    warning: z.string().optional(),
    message: z.string(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        schema: { type: 'string' },
        if_exists: { type: 'boolean', default: true },
        cascade: { type: 'boolean', default: false },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['schema'],
};

export const dropSchemaTool = {
    name: 'drop_schema',
    description: 'Drops a database schema. Defaults to IF EXISTS. CASCADE will drop all objects in the schema.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: DropSchemaInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: DropSchemaOutputSchema,

    execute: async (input: DropSchemaInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { schema, if_exists, cascade, dry_run } = input;

        validateIdentifiers([{ name: schema, context: 'Schema' }]);

        const ifExistsClause = if_exists ? 'IF EXISTS ' : '';
        const cascadeClause = cascade ? ' CASCADE' : '';

        const sql = `DROP SCHEMA ${ifExistsClause}${quoteIdentifier(schema)}${cascadeClause};`;

        let warning: string | undefined;
        if (cascade) {
            warning = '⚠️ WARNING: CASCADE will drop ALL objects (tables, views, functions, etc.) in this schema. This action cannot be undone!';
        }

        if (dry_run) {
            return {
                success: true,
                sql,
                warning,
                message: `DRY RUN: SQL prepared but not executed.${warning ? ' ' + warning : ''}`,
            };
        }

        context.log(`Dropping schema ${schema}...`, 'info');

        const result = await executeSqlWithFallback(client, sql, false);

        if ('error' in result) {
            throw new Error(`Failed to drop schema: ${result.error.message}`);
        }

        return {
            success: true,
            sql,
            warning,
            message: `Schema ${schema} dropped successfully.${warning ? ' ' + warning : ''}`,
        };
    },
};
