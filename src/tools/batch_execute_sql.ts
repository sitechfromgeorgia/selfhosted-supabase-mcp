/**
 * batch_execute_sql — Executes multiple SQL statements in a single transaction.
 *
 * Safety Features:
 * - Max statement limit (50)
 * - Returns per-statement results
 * - Transactional: all or nothing
 * - Privileged tool
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';
import type { PoolClient } from 'pg';

const MAX_STATEMENTS = 50;

const BatchExecuteSqlInputSchema = z.object({
    statements: z.array(z.string().min(1)).min(1).max(MAX_STATEMENTS),
    read_only: z.boolean().optional().default(false),
    dry_run: z.boolean().optional().default(false),
});

type BatchExecuteSqlInput = z.infer<typeof BatchExecuteSqlInputSchema>;

const BatchExecuteSqlOutputSchema = z.object({
    success: z.boolean(),
    message: z.string(),
    results: z.array(z.object({
        statement: z.string(),
        status: z.enum(['success', 'error']),
        rows_affected: z.number().optional(),
        error: z.string().optional(),
    })),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        statements: { type: 'array', items: { type: 'string' } },
        read_only: { type: 'boolean', default: false },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['statements'],
};

export const batchExecuteSqlTool = {
    name: 'batch_execute_sql',
    description: `Executes up to ${MAX_STATEMENTS} SQL statements in a single transaction. Returns per-statement results.`,
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: BatchExecuteSqlInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: BatchExecuteSqlOutputSchema,

    execute: async (input: BatchExecuteSqlInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { statements, read_only, dry_run } = input;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        if (read_only) {
            // Verify all statements are read-only
            const writeKeywords = ['insert', 'update', 'delete', 'drop', 'create', 'alter', 'truncate'];
            for (const stmt of statements) {
                const firstWord = stmt.trim().split(/\s+/)[0].toLowerCase();
                if (writeKeywords.includes(firstWord)) {
                    throw new Error(`Read-only mode: statement starting with "${firstWord}" is not allowed.`);
                }
            }
        }

        if (dry_run) {
            return {
                success: true,
                message: `DRY RUN: Would execute ${statements.length} statement(s) in a transaction.`,
                results: statements.map((s) => ({ statement: s, status: 'success' as const })),
            };
        }

        context.log(`Executing ${statements.length} statement(s) in batch...`, 'info');

        const results = await client.executeTransactionWithPg(async (pgClient: PoolClient) => {
            const output: Array<{ statement: string; status: 'success' | 'error'; rows_affected?: number; error?: string }> = [];

            for (const stmt of statements) {
                try {
                    const result = await pgClient.query(stmt);
                    output.push({
                        statement: stmt.substring(0, 200),
                        status: 'success',
                        rows_affected: result.rowCount ?? undefined,
                    });
                } catch (err: any) {
                    output.push({
                        statement: stmt.substring(0, 200),
                        status: 'error',
                        error: err.message,
                    });
                    // Transaction will be rolled back automatically on error
                    throw err;
                }
            }

            return output;
        });

        const errorCount = results.filter((r) => r.status === 'error').length;

        return {
            success: errorCount === 0,
            message: `Batch executed: ${results.length - errorCount}/${results.length} statements succeeded.${errorCount > 0 ? ' Transaction rolled back.' : ''}`,
            results,
        };
    },
};
