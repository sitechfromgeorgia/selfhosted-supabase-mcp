/**
 * alter_publication — Adds or removes tables from a PostgreSQL publication.
 *
 * Privileged tool.
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';
import { validateIdentifiers, quoteIdentifier } from './ddl-utils.js';

const AlterPublicationInputSchema = z.object({
    name: z.string().describe('Publication name'),
    add_tables: z.array(z.string()).optional().describe('Tables to add (schema.table format)'),
    drop_tables: z.array(z.string()).optional().describe('Tables to remove (schema.table format)'),
    set_tables: z.array(z.string()).optional().describe('Replace all tables with this list (schema.table format)'),
    dry_run: z.boolean().optional().default(false),
});

type AlterPublicationInput = z.infer<typeof AlterPublicationInputSchema>;

const AlterPublicationOutputSchema = z.object({
    success: z.boolean(),
    sql_statements: z.array(z.string()),
    message: z.string(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        name: { type: 'string' },
        add_tables: { type: 'array', items: { type: 'string' } },
        drop_tables: { type: 'array', items: { type: 'string' } },
        set_tables: { type: 'array', items: { type: 'string' } },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['name'],
};

export const alterPublicationTool = {
    name: 'alter_publication',
    description: 'Modifies a PostgreSQL publication by adding, removing, or replacing tables.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: AlterPublicationInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: AlterPublicationOutputSchema,

    execute: async (input: AlterPublicationInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { name, add_tables, drop_tables, set_tables, dry_run } = input;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        validateIdentifiers([{ name, context: 'Publication name' }]);

        const sqlStatements: string[] = [];

        const formatTable = (t: string) => {
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
        };

        if (set_tables !== undefined) {
            const refs = set_tables.map(formatTable);
            sqlStatements.push(`ALTER PUBLICATION ${quoteIdentifier(name)} SET TABLE ${refs.join(', ')};`);
        } else {
            if (add_tables && add_tables.length > 0) {
                const refs = add_tables.map(formatTable);
                sqlStatements.push(`ALTER PUBLICATION ${quoteIdentifier(name)} ADD TABLE ${refs.join(', ')};`);
            }
            if (drop_tables && drop_tables.length > 0) {
                const refs = drop_tables.map(formatTable);
                sqlStatements.push(`ALTER PUBLICATION ${quoteIdentifier(name)} DROP TABLE ${refs.join(', ')};`);
            }
        }

        if (sqlStatements.length === 0) {
            return {
                success: true,
                sql_statements: [],
                message: 'No changes specified. Use add_tables, drop_tables, or set_tables.',
            };
        }

        if (dry_run) {
            return {
                success: true,
                sql_statements: sqlStatements,
                message: `DRY RUN: ${sqlStatements.length} SQL statement(s) prepared but not executed.`,
            };
        }

        context.log(`Altering publication "${name}"...`, 'info');

        for (const sql of sqlStatements) {
            const result = await client.executeSqlWithPg(sql);
            if ('error' in result) {
                throw new Error(`Failed to alter publication: ${result.error.message}\nSQL: ${sql}`);
            }
        }

        return {
            success: true,
            sql_statements: sqlStatements,
            message: `Publication "${name}" altered successfully.`,
        };
    },
};
