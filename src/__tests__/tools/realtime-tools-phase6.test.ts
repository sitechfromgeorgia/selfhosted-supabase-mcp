/**
 * Unit tests for Phase 6 Realtime Management tools.
 */

import { describe, test, expect } from 'bun:test';
import { createPublicationTool } from '../../tools/create_publication.js';
import { alterPublicationTool } from '../../tools/alter_publication.js';
import { dropPublicationTool } from '../../tools/drop_publication.js';
import { listRealtimeChannelsTool } from '../../tools/list_realtime_channels.js';
import { getRealtimeConfigTool } from '../../tools/get_realtime_config.js';

// ------------------------------------------------------------------
// Privilege level tests
// ------------------------------------------------------------------
describe('Realtime Phase 6 tool privilege levels', () => {
    test('create_publication is privileged', () => {
        expect(createPublicationTool.privilegeLevel).toBe('privileged');
    });

    test('alter_publication is privileged', () => {
        expect(alterPublicationTool.privilegeLevel).toBe('privileged');
    });

    test('drop_publication is privileged', () => {
        expect(dropPublicationTool.privilegeLevel).toBe('privileged');
    });

    test('list_realtime_channels is regular', () => {
        expect(listRealtimeChannelsTool.privilegeLevel).toBe('regular');
    });

    test('get_realtime_config is regular', () => {
        expect(getRealtimeConfigTool.privilegeLevel).toBe('regular');
    });
});

// ------------------------------------------------------------------
// create_publication tests
// ------------------------------------------------------------------
describe('create_publication tool', () => {
    test('rejects without publish operations', async () => {
        await expect(
            createPublicationTool.execute(
                { name: 'pub1', tables: ['users'], publish_insert: false, publish_update: false, publish_delete: false, dry_run: true } as any,
                mockContext()
            )
        ).rejects.toThrow('At least one publish operation');
    });

    test('generates SQL with all operations', async () => {
        const result = await createPublicationTool.execute(
            { name: 'pub_users', tables: ['public.users', 'public.posts'], publish_insert: true, publish_update: true, publish_delete: true, dry_run: true } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.sql).toContain('CREATE PUBLICATION');
        expect(result.sql).toContain('pub_users');
        expect(result.sql).toContain('public.users');
        expect(result.sql).toContain("publish = 'insert,update,delete'");
    });

    test('rejects without pg connection', async () => {
        await expect(
            createPublicationTool.execute(
                { name: 'pub1', tables: ['users'], dry_run: true } as any,
                mockContextNoPg()
            )
        ).rejects.toThrow('DATABASE_URL');
    });
});

// ------------------------------------------------------------------
// alter_publication tests
// ------------------------------------------------------------------
describe('alter_publication tool', () => {
    test('generates ADD TABLE SQL', async () => {
        const result = await alterPublicationTool.execute(
            { name: 'pub_users', add_tables: ['public.comments'], dry_run: true } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.sql_statements[0]).toContain('ADD TABLE');
        expect(result.sql_statements[0]).toContain('public.comments');
    });

    test('generates DROP TABLE SQL', async () => {
        const result = await alterPublicationTool.execute(
            { name: 'pub_users', drop_tables: ['public.posts'], dry_run: true } as any,
            mockContext()
        );

        expect(result.sql_statements[0]).toContain('DROP TABLE');
    });

    test('generates SET TABLE SQL', async () => {
        const result = await alterPublicationTool.execute(
            { name: 'pub_users', set_tables: ['public.users'], dry_run: true } as any,
            mockContext()
        );

        expect(result.sql_statements[0]).toContain('SET TABLE');
    });
});

// ------------------------------------------------------------------
// drop_publication tests
// ------------------------------------------------------------------
describe('drop_publication tool', () => {
    test('generates DROP PUBLICATION SQL', async () => {
        const result = await dropPublicationTool.execute(
            { name: 'pub_users', dry_run: true } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.sql).toContain('DROP PUBLICATION IF EXISTS');
    });
});

// ------------------------------------------------------------------
// list_realtime_channels tests
// ------------------------------------------------------------------
describe('list_realtime_channels tool', () => {
    test('returns empty on missing schema', async () => {
        const result = await listRealtimeChannelsTool.execute(
            {} as any,
            mockContextWithError('relation "realtime.channels" does not exist')
        );

        expect(result.success).toBe(true);
        expect(result.channels).toHaveLength(0);
    });
});

// ------------------------------------------------------------------
// get_realtime_config tests
// ------------------------------------------------------------------
describe('get_realtime_config tool', () => {
    test('is regular privilege', () => {
        expect(getRealtimeConfigTool.privilegeLevel).toBe('regular');
    });
});

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function mockContext(): any {
    return {
        selfhostedClient: {
            isPgAvailable: () => true,
            executeSqlWithPg: () => Promise.resolve([{ id: 'test' }]),
        },
        workspacePath: '/tmp',
        user: undefined,
        log: () => {},
    };
}

function mockContextNoPg(): any {
    return {
        selfhostedClient: {
            isPgAvailable: () => false,
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
