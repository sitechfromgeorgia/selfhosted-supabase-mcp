/**
 * list_backups — Lists available backup files in the workspace backups directory.
 *
 * Regular tool (read-only).
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ListBackupsInputSchema = z.object({});

const BackupFileSchema = z.object({
    name: z.string(),
    path: z.string(),
    size_bytes: z.number(),
    created_at: z.string(),
    format: z.string(),
});

const ListBackupsOutputSchema = z.object({
    success: z.boolean(),
    backups: z.array(BackupFileSchema),
    count: z.number(),
    backup_directory: z.string(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {},
    required: [],
};

export const listBackupsTool = {
    name: 'list_backups',
    description: 'Lists database backup files in the workspace backups directory.',
    privilegeLevel: 'regular' as ToolPrivilegeLevel,
    inputSchema: ListBackupsInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: ListBackupsOutputSchema,

    execute: async (input: z.infer<typeof ListBackupsInputSchema>, context: ToolContext) => {
        const backupDir = path.join(context.workspacePath ?? '/tmp', 'backups');

        if (!fs.existsSync(backupDir)) {
            return {
                success: true,
                backups: [],
                count: 0,
                backup_directory: backupDir,
            };
        }

        context.log(`Listing backups in ${backupDir}...`, 'info');

        const files = fs.readdirSync(backupDir);
        const backups = files
            .filter((f) => f.endsWith('.sql') || f.endsWith('.sql.gz') || f.endsWith('.dump') || f.endsWith('.backup'))
            .map((f) => {
                const filePath = path.join(backupDir, f);
                const stats = fs.statSync(filePath);
                let format = 'plain';
                if (f.endsWith('.dump')) format = 'custom';
                else if (f.endsWith('.sql.gz')) format = 'plain-compressed';

                return {
                    name: f,
                    path: filePath,
                    size_bytes: stats.size,
                    created_at: stats.birthtime.toISOString(),
                    format,
                };
            })
            .sort((a, b) => b.created_at.localeCompare(a.created_at));

        return {
            success: true,
            backups,
            count: backups.length,
            backup_directory: backupDir,
        };
    },
};
