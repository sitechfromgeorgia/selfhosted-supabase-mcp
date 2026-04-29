/**
 * create_publication — Creates a PostgreSQL publication for realtime replication.
 *
 * Safety Features:
 * - Validates publication and table names
 * - Defaults to FOR TABLE (not FOR ALL TABLES)
 * - Privileged tool
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';
import { validateIdentifiers, quoteIdentifier } from './ddl-utils.js';

const CreatePublicationInputSchema = z.object({
    name: z.string().describe('Publication name'),
    tables: z.array(z.string()).min(1).describe('Tables to include (schema.table format)'),
    publish_insert: z.boolean().optional().default(true),
    publish_update: z.boolean().optional().default(true),
    publish_delete: z.boolean().optional().default(true),
    dry_run: z.boolean().optional().default(false),
});

type CreatePublicationInput = z.infer<typeof CreatePublicationInputSchema>;

const CreatePublicationOutputSchema = z.object({
    success: z.boolean(),
    sql: z.string(),
    message: z.string(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        name: { type: 'string' },
        tables: { type: 'array', items: { type: 'string' } },
        publish_insert: { type: 'boolean', default: true },
        publish_update: { type: 'boolean', default: true },
        publish_delete: { type: 'boolean', default: true },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['name', 'tables'],
};

export const createPublicationTool = {
    name: 'create_publication',
    description: 'Creates a PostgreSQL publication for realtime replication. Specify which tables and operations to publish.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: CreatePublicationInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: CreatePublicationOutputSchema,

    execute: async (input: CreatePublicationInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { name, tables, publish_insert, publish_update, publish_delete, dry_run } = input;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        validateIdentifiers([{ name, context: 'Publication name' }]);

        const publishOps: string[] = [];
        if (publish_insert) publishOps.push('insert');
        if (publish_update) publishOps.push('update');
        if (publish_delete) publishOps.push('delete');

        if (publishOps.length === 0) {
            throw new Error('At least one publish operation must be enabled (insert, update, or delete).');
        }

        const tableRefs = tables.map((t) => {
            const parts = t.split('.');
            if (parts.length === 2) {
                validateIdentifiers([
                    { name: parts[0], context: 'Schema' },
                    { name: parts[1], context: 'Table' },
                ]);
                return `${quoteIdentifier(parts[0])}.${quoteIdentifier(parts[1])}`;
            }
            validateIdentifiers([{ name: parts[0], context: 'Table' }]);
            return quoteIdentifier(parts[0]);
        });

        const sql = `CREATE PUBLICATION ${quoteIdentifier(name)} FOR TABLE ${tableRefs.join(', ')} WITH (publish = '${publishOps.join(',')}');`;

        if (dry_run) {
            return {
                success: true,
                sql,
                message: `DRY RUN: SQL prepared but not executed.`,
            };
        }

        context.log(`Creating publication "${name}"...`, 'info');

        const result = await client.executeSqlWithPg(sql);

        if ('error' in result) {
            throw new Error(`Failed to create publication: ${result.error.message}`);
        }

        return {
            success: true,
            sql,
            message: `Publication "${name}" created successfully for ${tables.length} table(s).`,
        };
    },
};
