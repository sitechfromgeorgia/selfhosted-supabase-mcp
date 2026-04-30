/**
 * get_replication_lag — Returns streaming replication status and lag.
 *
 * Regular tool.
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';

const GetReplicationLagInputSchema = z.object({});

const ReplicationLagSchema = z.object({
    client_addr: z.string().nullable(),
    state: z.string().nullable(),
    sent_lsn: z.string().nullable(),
    write_lsn: z.string().nullable(),
    flush_lsn: z.string().nullable(),
    replay_lsn: z.string().nullable(),
    write_lag: z.string().nullable(),
    flush_lag: z.string().nullable(),
    replay_lag: z.string().nullable(),
});

const GetReplicationLagOutputSchema = z.object({
    success: z.boolean(),
    replicas: z.array(ReplicationLagSchema),
    count: z.number(),
    is_primary: z.boolean(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {},
    required: [],
};

export const getReplicationLagTool = {
    name: 'get_replication_lag',
    description: 'Returns streaming replication status and lag for all connected replicas.',
    privilegeLevel: 'regular' as ToolPrivilegeLevel,
    inputSchema: GetReplicationLagInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: GetReplicationLagOutputSchema,

    execute: async (input: z.infer<typeof GetReplicationLagInputSchema>, context: ToolContext) => {
        const client = context.selfhostedClient;

        if (!client.isPgAvailable()) {
            throw new Error('Direct database connection (DATABASE_URL) is required.');
        }

        context.log('Fetching replication lag...', 'info');

        const result = await client.executeSqlWithPg(
            `SELECT
                client_addr,
                state,
                sent_lsn,
                write_lsn,
                flush_lsn,
                replay_lsn,
                write_lag::text,
                flush_lag::text,
                replay_lag::text
            FROM pg_stat_replication`
        );

        if ('error' in result) {
            throw new Error(`Failed to fetch replication status: ${result.error.message}`);
        }

        const replicas = result as any[];

        // Check if this is a primary
        const isPrimaryResult = await client.executeSqlWithPg(
            `SELECT pg_is_in_recovery() as is_replica`
        );
        const isReplica = !('error' in isPrimaryResult) && (isPrimaryResult as any[])[0]?.is_replica === true;

        return {
            success: true,
            replicas,
            count: replicas.length,
            is_primary: !isReplica,
        };
    },
};
