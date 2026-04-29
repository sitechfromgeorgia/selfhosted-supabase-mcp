/**
 * get_replication_slots — Lists logical replication slots.
 *
 * Regular tool.
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';

const GetReplicationSlotsInputSchema = z.object({});

const ReplicationSlotSchema = z.object({
    slot_name: z.string().nullable(),
    plugin: z.string().nullable(),
    slot_type: z.string().nullable(),
    database: z.string().nullable(),
    active: z.boolean().nullable(),
    restart_lsn: z.string().nullable(),
    confirmed_flush_lsn: z.string().nullable(),
});

const GetReplicationSlotsOutputSchema = z.object({
    success: z.boolean(),
    slots: z.array(ReplicationSlotSchema),
    count: z.number(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {},
    required: [],
};

export const getReplicationSlotsTool = {
    name: 'get_replication_slots',
    description: 'Lists logical replication slots for change data capture (CDC).',
    privilegeLevel: 'regular' as ToolPrivilegeLevel,
    inputSchema: GetReplicationSlotsInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: GetReplicationSlotsOutputSchema,

    execute: async (input: z.infer<typeof GetReplicationSlotsInputSchema>, context: ToolContext) => {
        const client = context.selfhostedClient;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        context.log('Fetching replication slots...', 'info');

        const result = await client.executeSqlWithPg(
            `SELECT
                slot_name,
                plugin,
                slot_type,
                database,
                active,
                restart_lsn,
                confirmed_flush_lsn
            FROM pg_replication_slots
            ORDER BY slot_name`
        );

        if ('error' in result) {
            throw new Error(`Failed to fetch replication slots: ${result.error.message}`);
        }

        const slots = result as any[];

        return {
            success: true,
            slots,
            count: slots.length,
        };
    },
};
