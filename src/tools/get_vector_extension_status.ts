/**
 * get_vector_extension_status — Checks pgvector installation and version.
 *
 * Regular tool (read-only).
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';

const GetVectorExtensionStatusInputSchema = z.object({});

const GetVectorExtensionStatusOutputSchema = z.object({
    success: z.boolean(),
    installed: z.boolean(),
    version: z.string().nullable(),
    latest_available: z.string().nullable(),
    has_update: z.boolean(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {},
    required: [],
};

export const getVectorExtensionStatusTool = {
    name: 'get_vector_extension_status',
    description: 'Checks if the pgvector extension is installed and returns its version.',
    privilegeLevel: 'regular' as ToolPrivilegeLevel,
    inputSchema: GetVectorExtensionStatusInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: GetVectorExtensionStatusOutputSchema,

    execute: async (input: z.infer<typeof GetVectorExtensionStatusInputSchema>, context: ToolContext) => {
        const client = context.selfhostedClient;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        context.log('Checking pgvector extension status...', 'info');

        // Check if pgvector is installed
        const installedResult = await client.executeSqlWithPg(
            `SELECT extversion FROM pg_extension WHERE extname = 'vector'`
        );

        if ('error' in installedResult) {
            throw new Error(`Failed to check pgvector: ${installedResult.error.message}`);
        }

        const installedRows = installedResult as any[];
        const installed = installedRows.length > 0;
        const version = installed ? installedRows[0].extversion : null;

        // Check latest available version
        const availableResult = await client.executeSqlWithPg(
            `SELECT version FROM pg_available_extensions WHERE name = 'vector'`
        );

        const availableRows = availableResult as any[];
        const latestAvailable = (!('error' in availableResult) && availableRows.length > 0)
            ? availableRows[0].version
            : null;

        const hasUpdate = installed && latestAvailable !== null && version !== latestAvailable;

        return {
            success: true,
            installed,
            version,
            latest_available: latestAvailable,
            has_update: hasUpdate,
        };
    },
};
