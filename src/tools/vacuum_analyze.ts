/**
 * vacuum_analyze — Runs VACUUM and/or ANALYZE on a table or the entire database.
 *
 * Supports VACUUM, VACUUM FULL, VACUUM ANALYZE.
 * Privileged tool.
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';
import { validateIdentifiers, quoteIdentifier } from './ddl-utils.js';

const VacuumAnalyzeInputSchema = z.object({
    schema: z.string().optional().default('public'),
    table: z.string().optional().describe('Target table (omit for entire database)'),
    full: z.boolean().optional().default(false).describe('VACUUM FULL (reclaims more space but locks table)'),
    analyze: z.boolean().optional().default(true).describe('Also run ANALYZE'),
    dry_run: z.boolean().optional().default(false),
});

type VacuumAnalyzeInput = z.infer<typeof VacuumAnalyzeInputSchema>;

const VacuumAnalyzeOutputSchema = z.object({
    success: z.boolean(),
    sql: z.string(),
    message: z.string(),
    warning: z.string().optional(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        schema: { type: 'string', default: 'public' },
        table: { type: 'string' },
        full: { type: 'boolean', default: false },
        analyze: { type: 'boolean', default: true },
        dry_run: { type: 'boolean', default: false },
    },
    required: [],
};

export const vacuumAnalyzeTool = {
    name: 'vacuum_analyze',
    description: 'Runs VACUUM and/or ANALYZE to reclaim space and update statistics. Use VACUUM FULL with caution (exclusive lock).',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: VacuumAnalyzeInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: VacuumAnalyzeOutputSchema,

    execute: async (input: VacuumAnalyzeInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { schema, table, full, analyze, dry_run } = input;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        let sql = 'VACUUM';
        if (full) sql += ' FULL';
        if (analyze) sql += ' ANALYZE';

        if (table) {
            validateIdentifiers([
                { name: schema, context: 'Schema' },
                { name: table, context: 'Table' },
            ]);
            sql += ` ${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
        }
        sql += ';';

        let warning: string | undefined;
        if (full) {
            warning = '⚠️ VACUUM FULL acquires an exclusive lock on the table. All other operations on this table will be blocked until complete.';
        }

        if (dry_run) {
            return {
                success: true,
                sql,
                message: `DRY RUN: SQL prepared but not executed.`,
                warning,
            };
        }

        context.log(`Running ${full ? 'VACUUM FULL' : 'VACUUM'}${analyze ? ' ANALYZE' : ''}...`, 'info');

        const result = await client.executeSqlWithPg(sql);

        if ('error' in result) {
            throw new Error(`VACUUM failed: ${result.error.message}`);
        }

        return {
            success: true,
            sql,
            message: `VACUUM${analyze ? ' ANALYZE' : ''} completed successfully${table ? ' on ' + schema + '.' + table : ' on database'}.`,
            warning,
        };
    },
};
