/**
 * list_realtime_channels — Lists active Realtime channel subscriptions.
 *
 * Queries realtime schema tables via pg.
 * Regular tool.
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';

const ListRealtimeChannelsInputSchema = z.object({
    limit: z.number().int().positive().optional().default(100),
    offset: z.number().int().nonnegative().optional().default(0),
});

type ListRealtimeChannelsInput = z.infer<typeof ListRealtimeChannelsInputSchema>;

const ChannelSchema = z.object({
    id: z.number().optional(),
    name: z.string().nullable(),
    inserted_at: z.string().nullable(),
    updated_at: z.string().nullable(),
});

const ListRealtimeChannelsOutputSchema = z.object({
    success: z.boolean(),
    channels: z.array(z.record(z.string(), z.any())),
    count: z.number(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        limit: { type: 'number', default: 100 },
        offset: { type: 'number', default: 0 },
    },
    required: [],
};

export const listRealtimeChannelsTool = {
    name: 'list_realtime_channels',
    description: 'Lists active Realtime channel subscriptions from the realtime schema.',
    privilegeLevel: 'regular' as ToolPrivilegeLevel,
    inputSchema: ListRealtimeChannelsInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: ListRealtimeChannelsOutputSchema,

    execute: async (input: ListRealtimeChannelsInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { limit, offset } = input;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        context.log('Listing realtime channels...', 'info');

        const result = await client.executeSqlWithPg(
            `SELECT * FROM realtime.channels ORDER BY inserted_at DESC LIMIT $1 OFFSET $2`,
            [limit, offset]
        );

        if ('error' in result) {
            // realtime schema may not exist
            if (result.error.message.includes('does not exist')) {
                return {
                    success: true,
                    channels: [],
                    count: 0,
                };
            }
            throw new Error(`Failed to list channels: ${result.error.message}`);
        }

        const channels = result as any[];

        return {
            success: true,
            channels,
            count: channels.length,
        };
    },
};
