/**
 * create_backup — Creates a database backup using pg_dump.
 *
 * Requires pg_dump binary to be available in PATH.
 * Output is a .sql file in the workspace backups directory.
 * Privileged tool.
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const CreateBackupInputSchema = z.object({
    format: z.enum(['plain', 'custom', 'directory']).optional().default('plain'),
    schemas: z.array(z.string()).optional().describe('Schemas to include (omit for all)'),
    tables: z.array(z.string()).optional().describe('Tables to include (omit for all)'),
    filename: z.string().optional().describe('Custom filename (default: auto-generated)'),
    compress: z.boolean().optional().default(true).describe('Compress plain output with gzip'),
    dry_run: z.boolean().optional().default(false),
});

type CreateBackupInput = z.infer<typeof CreateBackupInputSchema>;

const CreateBackupOutputSchema = z.object({
    success: z.boolean(),
    message: z.string(),
    file_path: z.string().optional(),
    size_bytes: z.number().optional(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        format: { type: 'string', enum: ['plain', 'custom', 'directory'], default: 'plain' },
        schemas: { type: 'array', items: { type: 'string' } },
        tables: { type: 'array', items: { type: 'string' } },
        filename: { type: 'string' },
        compress: { type: 'boolean', default: true },
        dry_run: { type: 'boolean', default: false },
    },
    required: [],
};

export const createBackupTool = {
    name: 'create_backup',
    description: 'Creates a database backup using pg_dump. Requires pg_dump binary and DATABASE_URL.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: CreateBackupInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: CreateBackupOutputSchema,

    execute: async (input: CreateBackupInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { format, schemas, tables, filename, compress, dry_run } = input;

        const dbUrl = client.getDbUrl();
        if (!dbUrl) {
            throw new Error('Direct database connection (DATABASE_URL) is required for backups.');
        }

        // Ensure backup directory exists
        const backupDir = path.join(context.workspacePath, 'backups');
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const baseName = filename || `backup-${timestamp}`;
        const ext = format === 'custom' ? '.dump' : format === 'directory' ? '' : '.sql';
        const outFile = path.join(backupDir, `${baseName}${ext}${compress && format === 'plain' ? '.gz' : ''}`);

        if (dry_run) {
            return {
                success: true,
                message: `DRY RUN: Would create backup at ${outFile} (format: ${format}).`,
                file_path: outFile,
            };
        }

        // Build pg_dump command
        const formatFlag = format === 'custom' ? '-Fc' : format === 'directory' ? '-Fd' : '-Fp';
        const schemaFlags = schemas ? schemas.map((s) => `-n ${s}`).join(' ') : '';
        const tableFlags = tables ? tables.map((t) => `-t ${t}`).join(' ') : '';
        const compressPipe = compress && format === 'plain' ? '| gzip' : '';

        const cmd = `pg_dump ${formatFlag} "${dbUrl}" ${schemaFlags} ${tableFlags} ${compressPipe ? '' : `-f "${outFile}"`}`;
        const finalCmd = compressPipe ? `${cmd} ${compressPipe} > "${outFile}"` : cmd;

        context.log(`Creating backup: ${outFile}...`, 'info');

        try {
            execSync(finalCmd, { stdio: 'pipe', timeout: 600000 });
            const stats = fs.statSync(outFile);

            return {
                success: true,
                message: `Backup created successfully at ${outFile} (${stats.size} bytes).`,
                file_path: outFile,
                size_bytes: stats.size,
            };
        } catch (err: any) {
            throw new Error(`Backup failed: ${err.message}. Ensure pg_dump is installed and in PATH.`);
        }
    },
};
