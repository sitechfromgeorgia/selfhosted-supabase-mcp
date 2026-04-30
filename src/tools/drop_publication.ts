/**
 * drop_publication — Removes a PostgreSQL publication.
 *
 * Safety Features:
 * - IF EXISTS guard (default: true)
 * - Validates identifier
 * - Privileged tool
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';
import { validateIdentifiers, quoteIdentifier } from './ddl-utils.js';

const DropPublicationInputSchema = z.object({
    name: z.string().describe('Publication to drop'),
    if_exists: z.boolean().optional().default(true),
    dry_run: z.boolean().optional().default(false),
});

type DropPublicationInput = z.infer<typeof DropPublicationInputSchema>;

const DropPublicationOutputSchema = z.object({
    success: z.boolean(),
    sql: z.string(),
    message: z.string(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        name: { type: 'string' },
        if_exists: { type: 'boolean', default: true },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['name'],
};

export const dropPublicationTool = {
    name: 'drop_publication',
    description: 'Drops a PostgreSQL publication used for realtime replication.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: DropPublicationInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: DropPublicationOutputSchema,

    execute: async (input: DropPublicationInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { name, if_exists: ifExistsInput, dry_run } = input;
        const if_exists = ifExistsInput ?? true;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        validateIdentifiers([{ name, context: 'Publication name' }]);

        const ifExistsClause = if_exists ? 'IF EXISTS ' : '';
        const sql = `DROP PUBLICATION ${ifExistsClause}${quoteIdentifier(name)};`;

        if (dry_run) {
            return {
                success: true,
                sql,
                message: `DRY RUN: SQL prepared but not executed.`,
            };
        }

        context.log(`Dropping publication "${name}"...`, 'info');

        const result = await client.executeSqlWithPg(sql);

        if ('error' in result) {
            throw new Error(`Failed to drop publication: ${result.error.message}`);
        }

        return {
            success: true,
            sql,
            message: `Publication "${name}" dropped successfully.`,
        };
    },
};
