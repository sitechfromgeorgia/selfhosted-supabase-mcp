/**
 * get_realtime_config — Retrieves Realtime server configuration.
 *
 * Queries realtime.configuration and pg_settings via pg.
 * Regular tool.
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';

const GetRealtimeConfigInputSchema = z.object({});

const GetRealtimeConfigOutputSchema = z.object({
    success: z.boolean(),
    config: z.record(z.string(), z.any()),
});

const mcpInputSchema = {
    type: 'object',
    properties: {},
    required: [],
};

export const getRealtimeConfigTool = {
    name: 'get_realtime_config',
    description: 'Retrieves Realtime server configuration including connection limits and replication settings.',
    privilegeLevel: 'regular' as ToolPrivilegeLevel,
    inputSchema: GetRealtimeConfigInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: GetRealtimeConfigOutputSchema,

    execute: async (input: z.infer<typeof GetRealtimeConfigInputSchema>, context: ToolContext) => {
        const client = context.selfhostedClient;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        context.log('Fetching realtime config...', 'info');

        const config: Record<string, unknown> = {};

        // Wal level (must be logical for realtime)
        try {
            const walResult = await client.executeSqlWithPg(
                `SELECT setting FROM pg_settings WHERE name = 'wal_level'`
            );
            if (!('error' in walResult)) {
                config.wal_level = (walResult as any[])[0]?.setting;
            }
        } catch {
            // ignore
        }

        // Max replication slots
        try {
            const slotsResult = await client.executeSqlWithPg(
                `SELECT setting FROM pg_settings WHERE name = 'max_replication_slots'`
            );
            if (!('error' in slotsResult)) {
                config.max_replication_slots = parseInt((slotsResult as any[])[0]?.setting || '0', 10);
            }
        } catch {
            // ignore
        }

        // Max wal senders
        try {
            const sendersResult = await client.executeSqlWithPg(
                `SELECT setting FROM pg_settings WHERE name = 'max_wal_senders'`
            );
            if (!('error' in sendersResult)) {
                config.max_wal_senders = parseInt((sendersResult as any[])[0]?.setting || '0', 10);
            }
        } catch {
            // ignore
        }

        // Active replication slots
        try {
            const activeSlotsResult = await client.executeSqlWithPg(
                `SELECT slot_name, plugin, slot_type, active FROM pg_replication_slots`
            );
            if (!('error' in activeSlotsResult)) {
                config.replication_slots = activeSlotsResult;
                config.active_slot_count = (activeSlotsResult as any[]).filter((s) => s.active).length;
            }
        } catch {
            // ignore
        }

        // Try realtime schema configuration if available
        try {
            const rtResult = await client.executeSqlWithPg(
                `SELECT * FROM realtime.configuration LIMIT 1`
            );
            if (!('error' in rtResult) && (rtResult as any[]).length > 0) {
                config.realtime_settings = (rtResult as any[])[0];
            }
        } catch {
            // realtime schema may not exist
        }

        return {
            success: true,
            config,
        };
    },
};
