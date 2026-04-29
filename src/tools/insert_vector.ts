/**
 * insert_vector — Inserts a row with a vector embedding and optional metadata.
 *
 * Supports pgvector vector type.
 * Privileged tool.
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';
import { validateIdentifiers, quoteIdentifier } from './ddl-utils.js';

const InsertVectorInputSchema = z.object({
    schema: z.string().optional().default('public'),
    table: z.string().describe('Target table'),
    data: z.record(z.any()).describe('Column values including vector as number array'),
    dry_run: z.boolean().optional().default(false),
});

type InsertVectorInput = z.infer<typeof InsertVectorInputSchema>;

const InsertVectorOutputSchema = z.object({
    success: z.boolean(),
    message: z.string(),
    inserted: z.record(z.any()).optional(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        schema: { type: 'string', default: 'public' },
        table: { type: 'string' },
        data: { type: 'object' },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['table', 'data'],
};

export const insertVectorTool = {
    name: 'insert_vector',
    description: 'Inserts a row with vector embedding into a table. Vector columns must be passed as number arrays.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: InsertVectorInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: InsertVectorOutputSchema,

    execute: async (input: InsertVectorInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { schema, table, data, dry_run } = input;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        validateIdentifiers([
            { name: schema, context: 'Schema' },
            { name: table, context: 'Table' },
            ...Object.keys(data).map((k) => ({ name: k, context: 'Column' })),
        ]);

        const tableRef = `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
        const columns = Object.keys(data).map(quoteIdentifier);
        const values: any[] = [];
        const placeholders: string[] = [];

        let idx = 1;
        for (const [key, value] of Object.entries(data)) {
            if (Array.isArray(value) && value.every((v) => typeof v === 'number')) {
                // Vector array
                placeholders.push(`$${idx++}::vector`);
            } else {
                placeholders.push(`$${idx++}`);
            }
            values.push(value);
        }

        const sql = `INSERT INTO ${tableRef} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *;`;

        if (dry_run) {
            return {
                success: true,
                message: `DRY RUN: Would insert row into ${schema}.${table}.`,
            };
        }

        context.log(`Inserting vector into ${schema}.${table}...`, 'info');

        const result = await client.executeSqlWithPg(sql, values);

        if ('error' in result) {
            throw new Error(`Insert failed: ${result.error.message}`);
        }

        return {
            success: true,
            message: `Row inserted into ${schema}.${table}.`,
            inserted: (result as any[])[0],
        };
    },
};
