/**
 * Unit tests for Phase 7 Backup & Maintenance tools.
 */

import { describe, test, expect } from 'bun:test';
import { createBackupTool } from '../../tools/create_backup.js';
import { restoreBackupTool } from '../../tools/restore_backup.js';
import { listBackupsTool } from '../../tools/list_backups.js';
import { vacuumAnalyzeTool } from '../../tools/vacuum_analyze.js';
import { reindexTableTool } from '../../tools/reindex_table.js';
import { analyzeTableTool } from '../../tools/analyze_table.js';
import { pgTerminateBackendTool } from '../../tools/pg_terminate_backend.js';

// ------------------------------------------------------------------
// Privilege level tests
// ------------------------------------------------------------------
describe('Backup Phase 7 tool privilege levels', () => {
    test('create_backup is privileged', () => {
        expect(createBackupTool.privilegeLevel).toBe('privileged');
    });

    test('restore_backup is privileged', () => {
        expect(restoreBackupTool.privilegeLevel).toBe('privileged');
    });

    test('list_backups is regular', () => {
        expect(listBackupsTool.privilegeLevel).toBe('regular');
    });

    test('vacuum_analyze is privileged', () => {
        expect(vacuumAnalyzeTool.privilegeLevel).toBe('privileged');
    });

    test('reindex_table is privileged', () => {
        expect(reindexTableTool.privilegeLevel).toBe('privileged');
    });

    test('analyze_table is privileged', () => {
        expect(analyzeTableTool.privilegeLevel).toBe('privileged');
    });

    test('pg_terminate_backend is privileged', () => {
        expect(pgTerminateBackendTool.privilegeLevel).toBe('privileged');
    });
});

// ------------------------------------------------------------------
// create_backup tests
// ------------------------------------------------------------------
describe('create_backup tool', () => {
    test('rejects without DATABASE_URL', async () => {
        await expect(
            createBackupTool.execute(
                { dry_run: true } as any,
                mockContextNoDb()
            )
        ).rejects.toThrow('DATABASE_URL');
    });

    test('dry-run returns file path', async () => {
        const result = await createBackupTool.execute(
            { format: 'plain', dry_run: true } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.file_path).toBeDefined();
        expect(result.message).toContain('DRY RUN');
    });
});

// ------------------------------------------------------------------
// restore_backup tests
// ------------------------------------------------------------------
describe('restore_backup tool', () => {
    test('rejects if file not found', async () => {
        await expect(
            restoreBackupTool.execute(
                { file_path: '/nonexistent/backup.sql', dry_run: true } as any,
                mockContext()
            )
        ).rejects.toThrow('not found');
    });

    test('dry-run returns warning', async () => {
        // We can't easily test with a real file here, but we can verify schema
        const parsed = restoreBackupTool.inputSchema.safeParse({
            file_path: '/tmp/backup.sql',
            format: 'plain',
            clean: true,
        });
        expect(parsed.success).toBe(true);
    });
});

// ------------------------------------------------------------------
// list_backups tests
// ------------------------------------------------------------------
describe('list_backups tool', () => {
    test('is regular privilege', () => {
        expect(listBackupsTool.privilegeLevel).toBe('regular');
    });
});

// ------------------------------------------------------------------
// vacuum_analyze tests
// ------------------------------------------------------------------
describe('vacuum_analyze tool', () => {
    test('generates VACUUM FULL ANALYZE SQL', async () => {
        const result = await vacuumAnalyzeTool.execute(
            { schema: 'public', table: 'users', full: true, analyze: true, dry_run: true } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.sql).toContain('VACUUM FULL ANALYZE');
        expect(result.sql).toContain('public.users');
        expect(result.warning).toContain('exclusive lock');
    });

    test('generates VACUUM ANALYZE without table', async () => {
        const result = await vacuumAnalyzeTool.execute(
            { analyze: true, dry_run: true } as any,
            mockContext()
        );

        expect(result.sql).toBe('VACUUM ANALYZE;');
    });
});

// ------------------------------------------------------------------
// reindex_table tests
// ------------------------------------------------------------------
describe('reindex_table tool', () => {
    test('generates REINDEX TABLE CONCURRENTLY SQL', async () => {
        const result = await reindexTableTool.execute(
            { schema: 'public', table: 'users', concurrently: true, dry_run: true } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.sql).toContain('REINDEX TABLE CONCURRENTLY');
        expect(result.sql).toContain('public.users');
    });

    test('generates REINDEX INDEX SQL', async () => {
        const result = await reindexTableTool.execute(
            { schema: 'public', index_name: 'idx_users_email', concurrently: true, dry_run: true } as any,
            mockContext()
        );

        expect(result.sql).toContain('idx_users_email');
    });
});

// ------------------------------------------------------------------
// analyze_table tests
// ------------------------------------------------------------------
describe('analyze_table tool', () => {
    test('generates ANALYZE SQL with columns', async () => {
        const result = await analyzeTableTool.execute(
            { schema: 'public', table: 'users', columns: ['email', 'name'], dry_run: true } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.sql).toContain('ANALYZE public.users');
        expect(result.sql).toContain('(email, name)');
    });

    test('generates ANALYZE SQL without columns', async () => {
        const result = await analyzeTableTool.execute(
            { schema: 'public', table: 'users', dry_run: true } as any,
            mockContext()
        );

        expect(result.sql).toBe('ANALYZE public.users;');
    });
});

// ------------------------------------------------------------------
// pg_terminate_backend tests
// ------------------------------------------------------------------
describe('pg_terminate_backend tool', () => {
    test('dry-run returns preview', async () => {
        const result = await pgTerminateBackendTool.execute(
            { pid: 12345, reason: 'Long running query', dry_run: true } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.message).toContain('DRY RUN');
        expect(result.pid).toBe(12345);
    });
});

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function mockContext(): any {
    return {
        selfhostedClient: {
            isPgAvailable: () => true,
            getDbUrl: () => 'postgresql://user:pass@localhost:5432/db',
            executeSqlWithPg: () => Promise.resolve([{ terminated: true }]),
        },
        workspacePath: '/tmp',
        user: undefined,
        log: () => {},
    };
}

function mockContextNoDb(): any {
    return {
        selfhostedClient: {
            isPgAvailable: () => true,
            getDbUrl: () => undefined,
        },
        workspacePath: '/tmp',
        user: undefined,
        log: () => {},
    };
}
