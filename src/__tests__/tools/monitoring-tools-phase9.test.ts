/**
 * Unit tests for Phase 9 Performance & Monitoring tools.
 */

import { describe, test, expect } from 'bun:test';
import { getSlowQueriesTool } from '../../tools/get_slow_queries.js';
import { getTableSizesTool } from '../../tools/get_table_sizes.js';
import { getReplicationLagTool } from '../../tools/get_replication_lag.js';
import { getLocksTool } from '../../tools/get_locks.js';
import { getDeadlocksTool } from '../../tools/get_deadlocks.js';
import { getCacheHitRatioTool } from '../../tools/get_cache_hit_ratio.js';
import { getAutovacuumStatusTool } from '../../tools/get_autovacuum_status.js';
import { getConnectionPoolStatsTool } from '../../tools/get_connection_pool_stats.js';

// ------------------------------------------------------------------
// Privilege level tests
// ------------------------------------------------------------------
describe('Monitoring Phase 9 tool privilege levels', () => {
    test('get_slow_queries is regular', () => {
        expect(getSlowQueriesTool.privilegeLevel).toBe('regular');
    });

    test('get_table_sizes is regular', () => {
        expect(getTableSizesTool.privilegeLevel).toBe('regular');
    });

    test('get_replication_lag is regular', () => {
        expect(getReplicationLagTool.privilegeLevel).toBe('regular');
    });

    test('get_locks is regular', () => {
        expect(getLocksTool.privilegeLevel).toBe('regular');
    });

    test('get_deadlocks is regular', () => {
        expect(getDeadlocksTool.privilegeLevel).toBe('regular');
    });

    test('get_cache_hit_ratio is regular', () => {
        expect(getCacheHitRatioTool.privilegeLevel).toBe('regular');
    });

    test('get_autovacuum_status is regular', () => {
        expect(getAutovacuumStatusTool.privilegeLevel).toBe('regular');
    });

    test('get_connection_pool_stats is regular', () => {
        expect(getConnectionPoolStatsTool.privilegeLevel).toBe('regular');
    });
});

// ------------------------------------------------------------------
// get_slow_queries tests
// ------------------------------------------------------------------
describe('get_slow_queries tool', () => {
    test('suggests enabling extension if missing', async () => {
        await expect(
            getSlowQueriesTool.execute(
                { limit: 10 } as any,
                mockContextWithError('relation "pg_stat_statements" does not exist')
            )
        ).rejects.toThrow('pg_stat_statements');
    });
});

// ------------------------------------------------------------------
// get_table_sizes tests
// ------------------------------------------------------------------
describe('get_table_sizes tool', () => {
    test('is regular privilege', () => {
        expect(getTableSizesTool.privilegeLevel).toBe('regular');
    });
});

// ------------------------------------------------------------------
// get_replication_lag tests
// ------------------------------------------------------------------
describe('get_replication_lag tool', () => {
    test('detects primary/replica status', async () => {
        const result = await getReplicationLagTool.execute(
            {} as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(typeof result.is_primary).toBe('boolean');
    });
});

// ------------------------------------------------------------------
// get_locks tests
// ------------------------------------------------------------------
describe('get_locks tool', () => {
    test('is regular privilege', () => {
        expect(getLocksTool.privilegeLevel).toBe('regular');
    });
});

// ------------------------------------------------------------------
// get_deadlocks tests
// ------------------------------------------------------------------
describe('get_deadlocks tool', () => {
    test('returns log_lock_waits status', async () => {
        const result = await getDeadlocksTool.execute(
            { limit: 5 } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(typeof result.log_lock_waits_enabled).toBe('boolean');
    });
});

// ------------------------------------------------------------------
// get_cache_hit_ratio tests
// ------------------------------------------------------------------
describe('get_cache_hit_ratio tool', () => {
    test('returns overall ratio and low hit tables', async () => {
        const result = await getCacheHitRatioTool.execute(
            {} as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(typeof result.overall_ratio).toBe('number');
        expect(Array.isArray(result.low_hit_ratio_tables)).toBe(true);
    });
});

// ------------------------------------------------------------------
// get_autovacuum_status tests
// ------------------------------------------------------------------
describe('get_autovacuum_status tool', () => {
    test('filters by min dead tuples', async () => {
        const result = await getAutovacuumStatusTool.execute(
            { min_dead_tuples: 100, limit: 10 } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(Array.isArray(result.needs_vacuum)).toBe(true);
    });
});

// ------------------------------------------------------------------
// get_connection_pool_stats tests
// ------------------------------------------------------------------
describe('get_connection_pool_stats tool', () => {
    test('returns utilization percentage', async () => {
        const result = await getConnectionPoolStatsTool.execute(
            {} as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(typeof result.total_connections).toBe('number');
        expect(typeof result.max_connections).toBe('number');
        expect(typeof result.usage_percent).toBe('number');
    });
});

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function mockContext(): any {
    return {
        selfhostedClient: {
            isPgAvailable: () => true,
            executeSqlWithPg: (sql: string, params?: any[]) => {
                if (sql.includes('pg_is_in_recovery')) return Promise.resolve([{ is_replica: false }]);
                if (sql.includes('pg_settings')) return Promise.resolve([{ setting: '100' }]);
                if (sql.includes('pg_stat_activity')) return Promise.resolve([{ state: 'active', count: 5 }]);
                if (sql.includes('pg_statio_user_tables')) return Promise.resolve([{ schema_name: 'public', table_name: 'users', heap_reads: 10, heap_hits: 990, hit_ratio: 99 }]);
                if (sql.includes('pg_stat_user_tables')) return Promise.resolve([{ schema_name: 'public', table_name: 'users', n_live_tup: 1000, n_dead_tup: 50 }]);
                return Promise.resolve([]);
            },
        },
        workspacePath: '/tmp',
        user: undefined,
        log: () => {},
    };
}

function mockContextWithError(errorMessage: string): any {
    return {
        selfhostedClient: {
            isPgAvailable: () => true,
            executeSqlWithPg: () => Promise.resolve({ error: { message: errorMessage } }),
        },
        workspacePath: '/tmp',
        user: undefined,
        log: () => {},
    };
}
