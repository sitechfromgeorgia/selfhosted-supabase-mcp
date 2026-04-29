/**
 * restore_backup — Restores a database from a backup file.
 *
 * Supports plain SQL, custom format, and directory format.
 * WARNING: Destructive operation. Use with caution.
 * Privileged tool.
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const RestoreBackupInputSchema = z.object({
    file_path: z.string().describe('Path to backup file'),
    format: z.enum(['plain', 'custom', 'directory']).optional().default('plain'),
    clean: z.boolean().optional().default(false).describe('Drop objects before recreating (psql -c)'),
    dry_run: z.boolean().optional().default(false),
});

type RestoreBackupInput = z.infer<typeof RestoreBackupInputSchema>;

const RestoreBackupOutputSchema = z.object({
    success: z.boolean(),
    message: z.string(),
    warning: z.string().optional(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        file_path: { type: 'string' },
        format: { type: 'string', enum: ['plain', 'custom', 'directory'], default: 'plain' },
        clean: { type: 'boolean', default: false },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['file_path'],
};

export const restoreBackupTool = {
    name: 'restore_backup',
    description: 'Restores a database from a backup file. WARNING: May overwrite existing data.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: RestoreBackupInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: RestoreBackupOutputSchema,

    execute: async (input: RestoreBackupInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { file_path, format, clean, dry_run } = input;

        const dbUrl = client.getDbUrl();
        if (!dbUrl) {
            throw new Error('Direct database connection (DATABASE_URL) is required for restore.');
        }

        if (!fs.existsSync(file_path)) {
            throw new Error(`Backup file not found: ${file_path}`);
        }

        const warning = '⚠️ WARNING: This will overwrite existing database objects. Ensure you have a current backup before proceeding.';

        if (dry_run) {
            return {
                success: true,
                message: `DRY RUN: Would restore from ${file_path} (format: ${format}).`,
                warning,
            };
        }

        context.log(`Restoring backup from ${file_path}...`, 'info');

        let cmd: string;

        if (format === 'plain') {
            const isGzipped = file_path.endsWith('.gz');
            const inputCmd = isGzipped ? `gunzip -c "${file_path}"` : `"${file_path}"`;
            const cleanFlag = clean ? '-c' : '';
            cmd = isGzipped
                ? `gunzip -c "${file_path}" | psql "${dbUrl}" ${cleanFlag}`
                : `psql "${dbUrl}" ${cleanFlag} -f "${file_path}"`;
        } else if (format === 'custom') {
            const cleanFlag = clean ? '--clean' : '';
            cmd = `pg_restore ${cleanFlag} -d "${dbUrl}" "${file_path}"`;
        } else {
            // directory format
            const cleanFlag = clean ? '--clean' : '';
            cmd = `pg_restore ${cleanFlag} -d "${dbUrl}" -Fd "${file_path}"`;
        }

        try {
            execSync(cmd, { stdio: 'pipe', timeout: 600000 });

            return {
                success: true,
                message: `Database restored successfully from ${file_path}.`,
                warning,
            };
        } catch (err: any) {
            throw new Error(`Restore failed: ${err.message}. Ensure pg_restore/psql is installed and in PATH.`);
        }
    },
};
