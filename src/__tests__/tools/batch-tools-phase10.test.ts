/**
 * Unit tests for Phase 10 Batch Data Operations tools.
 */

import { describe, test, expect } from 'bun:test';
import { bulkInsertTool } from '../../tools/bulk_insert.js';
import { bulkUpdateTool } from '../../tools/bulk_update.js';
import { bulkDeleteTool } from '../../tools/bulk_delete.js';
import { upsertTool } from '../../tools/upsert.js';
import { batchExecuteSqlTool } from '../../tools/batch_execute_sql.js';
import { importCsvTool } from '../../tools/import_csv.js';
import { exportTableTool } from '../../tools/export_table.js';

// ------------------------------------------------------------------
// Privilege level tests
// ------------------------------------------------------------------
describe('Batch Phase 10 tool privilege levels', () => {
    test('bulk_insert is privileged', () => {
        expect(bulkInsertTool.privilegeLevel).toBe('privileged');
    });

    test('bulk_update is privileged', () => {
        expect(bulkUpdateTool.privilegeLevel).toBe('privileged');
    });

    test('bulk_delete is privileged', () => {
        expect(bulkDeleteTool.privilegeLevel).toBe('privileged');
    });

    test('upsert is privileged', () => {
        expect(upsertTool.privilegeLevel).toBe('privileged');
    });

    test('batch_execute_sql is privileged', () => {
        expect(batchExecuteSqlTool.privilegeLevel).toBe('privileged');
    });

    test('import_csv is privileged', () => {
        expect(importCsvTool.privilegeLevel).toBe('privileged');
    });

    test('export_table is regular', () => {
        expect(exportTableTool.privilegeLevel).toBe('regular');
    });
});

// ------------------------------------------------------------------
// bulk_insert tests
// ------------------------------------------------------------------
describe('bulk_insert tool', () => {
    test('respects max batch size', () => {
        const tooMany = Array.from({ length: 1001 }, () => ({ name: 'test' }));
        const parsed = bulkInsertTool.inputSchema.safeParse({ table: 'users', rows: tooMany });
        expect(parsed.success).toBe(false);
    });

    test('dry-run returns count', async () => {
        const result = await bulkInsertTool.execute(
            { table: 'users', rows: [{ name: 'Alice' }, { name: 'Bob' }], dry_run: true } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.message).toContain('DRY RUN');
        expect(result.inserted_count).toBe(0);
    });
});

// ------------------------------------------------------------------
// bulk_update tests
// ------------------------------------------------------------------
describe('bulk_update tool', () => {
    test('requires WHERE clause', () => {
        const parsed = bulkUpdateTool.inputSchema.safeParse({ table: 'users', set: { status: 'active' } });
        expect(parsed.success).toBe(false);
    });

    test('dry-run returns preview', async () => {
        const result = await bulkUpdateTool.execute(
            { table: 'users', set: { status: 'active' }, where: 'id = 1', dry_run: true } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.message).toContain('DRY RUN');
    });
});

// ------------------------------------------------------------------
// bulk_delete tests
// ------------------------------------------------------------------
describe('bulk_delete tool', () => {
    test('requires WHERE clause', () => {
        const parsed = bulkDeleteTool.inputSchema.safeParse({ table: 'users' });
        expect(parsed.success).toBe(false);
    });

    test('dry-run counts matching rows', async () => {
        const result = await bulkDeleteTool.execute(
            { table: 'users', where: 'created_at < now() - interval \'30 days\'', dry_run: true } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.message).toContain('DRY RUN');
    });
});

// ------------------------------------------------------------------
// upsert tests
// ------------------------------------------------------------------
describe('upsert tool', () => {
    test('generates ON CONFLICT DO UPDATE SQL', async () => {
        const result = await upsertTool.execute(
            { table: 'users', data: { id: 1, email: 'test@test.com', name: 'Test' }, conflict_columns: ['id'], update_columns: ['email', 'name'], dry_run: true } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.message).toContain('DRY RUN');
    });

    test('generates ON CONFLICT DO NOTHING SQL', async () => {
        const result = await upsertTool.execute(
            { table: 'users', data: { id: 1, email: 'test@test.com' }, conflict_columns: ['id'], dry_run: true } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
    });
});

// ------------------------------------------------------------------
// batch_execute_sql tests
// ------------------------------------------------------------------
describe('batch_execute_sql tool', () => {
    test('respects max statements', () => {
        const tooMany = Array.from({ length: 51 }, (_, i) => `SELECT ${i}`);
        const parsed = batchExecuteSqlTool.inputSchema.safeParse({ statements: tooMany });
        expect(parsed.success).toBe(false);
    });

    test('read-only mode rejects writes', async () => {
        await expect(
            batchExecuteSqlTool.execute(
                { statements: ["DELETE FROM users WHERE id = 1"], read_only: true, dry_run: true } as any,
                mockContext()
            )
        ).rejects.toThrow('Read-only mode');
    });
});

// ------------------------------------------------------------------
// import_csv tests
// ------------------------------------------------------------------
describe('import_csv tool', () => {
    test('rejects empty CSV', async () => {
        await expect(
            importCsvTool.execute(
                { table: 'users', csv_content: '\n\n', has_header: true, dry_run: true } as any,
                mockContext()
            )
        ).rejects.toThrow('No data rows');
    });

    test('dry-run counts rows', async () => {
        const csv = 'name,email\nAlice,alice@test.com\nBob,bob@test.com';
        const result = await importCsvTool.execute(
            { table: 'users', csv_content: csv, has_header: true, columns: ['name', 'email'], dry_run: true } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.message).toContain('2 rows');
    });
});

// ------------------------------------------------------------------
// export_table tests
// ------------------------------------------------------------------
describe('export_table tool', () => {
    test('exports CSV with header', async () => {
        const result = await exportTableTool.execute(
            { table: 'users', format: 'csv', limit: 2, include_header: true } as any,
            mockContextWithRows()
        );

        expect(result.success).toBe(true);
        expect(result.format).toBe('csv');
        expect(result.content).toContain('name,email');
        expect(result.row_count).toBe(2);
    });

    test('exports JSON', async () => {
        const result = await exportTableTool.execute(
            { table: 'users', format: 'json', limit: 2 } as any,
            mockContextWithRows()
        );

        expect(result.success).toBe(true);
        expect(result.format).toBe('json');
        expect(result.content).toContain('[');
    });
});

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function mockContext(): any {
    return {
        selfhostedClient: {
            isPgAvailable: () => true,
            executeSqlWithPg: () => Promise.resolve([{ id: 1 }]),
            executeTransactionWithPg: (fn: any) => {
                const mockPg = { query: () => Promise.resolve({ rowCount: 1 }) };
                return fn(mockPg);
            },
        },
        workspacePath: '/tmp',
        user: undefined,
        log: () => {},
    };
}

function mockContextWithRows(): any {
    return {
        selfhostedClient: {
            isPgAvailable: () => true,
            executeSqlWithPg: () => Promise.resolve([
                { name: 'Alice', email: 'alice@test.com' },
                { name: 'Bob', email: 'bob@test.com' },
            ]),
        },
        workspacePath: '/tmp',
        user: undefined,
        log: () => {},
    };
}
