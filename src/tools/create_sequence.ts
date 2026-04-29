/**
 * create_sequence - Creates a PostgreSQL sequence for auto-increment IDs.
 *
 * Safety Features:
 * - IF NOT EXISTS guard (default: true)
 * - Validates identifier
 * - Supports START, INCREMENT, MINVALUE, MAXVALUE, CYCLE options
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';
import { executeSqlWithFallback } from './utils.js';
import { validateIdentifiers, quoteIdentifier } from './ddl-utils.js';

const CreateSequenceInputSchema = z.object({
    schema: z.string().optional().default('public'),
    name: z.string().describe('Sequence name'),
    if_not_exists: z.boolean().optional().default(true),
    start: z.number().optional().describe('Starting value'),
    increment: z.number().optional().describe('Increment step'),
    minvalue: z.number().optional().describe('Minimum value'),
    maxvalue: z.number().optional().describe('Maximum value'),
    cycle: z.boolean().optional().default(false).describe('Restart from min when max reached'),
    cache: z.number().optional().describe('Number of sequence values to cache'),
    owned_by: z.string().optional().describe('Column that owns this sequence (e.g., table.column)'),
    dry_run: z.boolean().optional().default(false),
});

type CreateSequenceInput = z.infer<typeof CreateSequenceInputSchema>;

const CreateSequenceOutputSchema = z.object({
    success: z.boolean(),
    sql: z.string(),
    message: z.string(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        schema: { type: 'string', default: 'public' },
        name: { type: 'string' },
        if_not_exists: { type: 'boolean', default: true },
        start: { type: 'number' },
        increment: { type: 'number' },
        minvalue: { type: 'number' },
        maxvalue: { type: 'number' },
        cycle: { type: 'boolean', default: false },
        cache: { type: 'number' },
        owned_by: { type: 'string' },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['name'],
};

export const createSequenceTool = {
    name: 'create_sequence',
    description: 'Creates a PostgreSQL sequence for auto-increment or custom numbering. Supports START, INCREMENT, MINVALUE, MAXVALUE, CYCLE.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: CreateSequenceInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: CreateSequenceOutputSchema,

    execute: async (input: CreateSequenceInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { schema, name, if_not_exists, start, increment, minvalue, maxvalue, cycle, cache, owned_by, dry_run } = input;

        validateIdentifiers([
            { name: schema, context: 'Schema' },
            { name: name, context: 'Sequence name' },
        ]);

        const ifNotExistsClause = if_not_exists ? 'IF NOT EXISTS ' : '';
        const parts: string[] = [`CREATE SEQUENCE ${ifNotExistsClause}${quoteIdentifier(schema)}.${quoteIdentifier(name)}`];

        if (start !== undefined) parts.push(`START ${start}`);
        if (increment !== undefined) parts.push(`INCREMENT ${increment}`);
        if (minvalue !== undefined) parts.push(`MINVALUE ${minvalue}`);
        if (maxvalue !== undefined) parts.push(`MAXVALUE ${maxvalue}`);
        if (cycle) parts.push('CYCLE');
        if (cache !== undefined) parts.push(`CACHE ${cache}`);
        if (owned_by) {
            // Validate owned_by format: table.column
            const [table, column] = owned_by.split('.');
            if (!table || !column) {
                throw new Error('owned_by must be in format "table.column"');
            }
            validateIdentifiers([
                { name: table, context: 'Owned by table' },
                { name: column, context: 'Owned by column' },
            ]);
            parts.push(`OWNED BY ${quoteIdentifier(schema)}.${quoteIdentifier(table)}.${quoteIdentifier(column)}`);
        }

        const sql = parts.join(' ') + ';';

        if (dry_run) {
            return {
                success: true,
                sql,
                message: `DRY RUN: SQL prepared but not executed.`,
            };
        }

        context.log(`Creating sequence ${schema}.${name}...`, 'info');

        const result = await executeSqlWithFallback(client, sql, false);

        if ('error' in result) {
            throw new Error(`Failed to create sequence: ${result.error.message}`);
        }

        return {
            success: true,
            sql,
            message: `Sequence ${schema}.${name} created successfully.`,
        };
    },
};
