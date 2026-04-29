/**
 * Unit tests for Phase 4 Vector / AI Operations tools.
 */

import { describe, test, expect } from 'bun:test';
import { searchSimilarVectorsTool } from '../../tools/search_similar_vectors.js';
import { insertVectorTool } from '../../tools/insert_vector.js';
import { createVectorIndexTool } from '../../tools/create_vector_index.js';
import { dropVectorIndexTool } from '../../tools/drop_vector_index.js';
import { getVectorExtensionStatusTool } from '../../tools/get_vector_extension_status.js';
import { optimizeVectorIndexTool } from '../../tools/optimize_vector_index.js';

// ------------------------------------------------------------------
// Privilege level tests
// ------------------------------------------------------------------
describe('Vector Phase 4 tool privilege levels', () => {
    test('search_similar_vectors is regular', () => {
        expect(searchSimilarVectorsTool.privilegeLevel).toBe('regular');
    });

    test('insert_vector is privileged', () => {
        expect(insertVectorTool.privilegeLevel).toBe('privileged');
    });

    test('create_vector_index is privileged', () => {
        expect(createVectorIndexTool.privilegeLevel).toBe('privileged');
    });

    test('drop_vector_index is privileged', () => {
        expect(dropVectorIndexTool.privilegeLevel).toBe('privileged');
    });

    test('get_vector_extension_status is regular', () => {
        expect(getVectorExtensionStatusTool.privilegeLevel).toBe('regular');
    });

    test('optimize_vector_index is privileged', () => {
        expect(optimizeVectorIndexTool.privilegeLevel).toBe('privileged');
    });
});

// ------------------------------------------------------------------
// search_similar_vectors tests
// ------------------------------------------------------------------
describe('search_similar_vectors tool', () => {
    test('rejects without pg connection', async () => {
        await expect(
            searchSimilarVectorsTool.execute(
                { table: 'items', column: 'embedding', query_vector: [0.1, 0.2, 0.3] } as any,
                mockContextNoPg()
            )
        ).rejects.toThrow('DATABASE_URL');
    });

    test('dry-run returns empty results', async () => {
        const result = await searchSimilarVectorsTool.execute(
            { table: 'items', column: 'embedding', query_vector: [0.1, 0.2, 0.3], top_k: 5, dry_run: true } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.count).toBe(0);
        expect(result.query_dimensions).toBe(3);
        expect(result.distance_metric).toBe('cosine');
    });
});

// ------------------------------------------------------------------
// insert_vector tests
// ------------------------------------------------------------------
describe('insert_vector tool', () => {
    test('rejects without pg connection', async () => {
        await expect(
            insertVectorTool.execute(
                { table: 'items', data: { embedding: [0.1, 0.2] } } as any,
                mockContextNoPg()
            )
        ).rejects.toThrow('DATABASE_URL');
    });

    test('dry-run returns preview', async () => {
        const result = await insertVectorTool.execute(
            { table: 'items', data: { embedding: [0.1, 0.2], content: 'hello' }, dry_run: true } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.message).toContain('DRY RUN');
    });
});

// ------------------------------------------------------------------
// create_vector_index tests
// ------------------------------------------------------------------
describe('create_vector_index tool', () => {
    test('rejects without pg connection', async () => {
        await expect(
            createVectorIndexTool.execute(
                { table: 'items', column: 'embedding' } as any,
                mockContextNoPg()
            )
        ).rejects.toThrow('DATABASE_URL');
    });

    test('generates HNSW SQL with defaults', async () => {
        const result = await createVectorIndexTool.execute(
            { table: 'items', column: 'embedding', method: 'hnsw', distance_metric: 'cosine', dry_run: true } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.sql).toContain('CREATE INDEX');
        expect(result.sql).toContain('USING hnsw');
        expect(result.sql).toContain('vector_cosine_ops');
    });

    test('generates IVFFlat SQL with lists', async () => {
        const result = await createVectorIndexTool.execute(
            { table: 'items', column: 'embedding', method: 'ivfflat', lists: 100, dry_run: true } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.sql).toContain('USING ivfflat');
        expect(result.sql).toContain('lists = 100');
    });

    test('generates HNSW with custom params', async () => {
        const result = await createVectorIndexTool.execute(
            { table: 'items', column: 'embedding', method: 'hnsw', ef_construction: 128, m: 32, ef_search: 64, dry_run: true } as any,
            mockContext()
        );

        expect(result.sql).toContain('ef_construction = 128');
        expect(result.sql).toContain('m = 32');
        expect(result.sql).toContain('SET hnsw.ef_search = 64');
    });
});

// ------------------------------------------------------------------
// drop_vector_index tests
// ------------------------------------------------------------------
describe('drop_vector_index tool', () => {
    test('generates DROP INDEX SQL', async () => {
        const result = await dropVectorIndexTool.execute(
            { index_name: 'idx_items_embedding', dry_run: true } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.sql).toContain('DROP INDEX');
        expect(result.sql).toContain('idx_items_embedding');
    });
});

// ------------------------------------------------------------------
// get_vector_extension_status tests
// ------------------------------------------------------------------
describe('get_vector_extension_status tool', () => {
    test('is regular privilege', () => {
        expect(getVectorExtensionStatusTool.privilegeLevel).toBe('regular');
    });
});

// ------------------------------------------------------------------
// optimize_vector_index tests
// ------------------------------------------------------------------
describe('optimize_vector_index tool', () => {
    test('dry-run returns preview', async () => {
        const result = await optimizeVectorIndexTool.execute(
            { dry_run: true } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.message).toContain('DRY RUN');
    });
});

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function mockContext(): any {
    return {
        selfhostedClient: {
            isPgAvailable: () => true,
            executeSqlWithPg: (sql: string, params?: any[]) => Promise.resolve([{ id: 'test' }]),
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
