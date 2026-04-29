import { describe, test, expect } from 'bun:test';
import { explainQueryTool } from '../../tools/explain_query.js';
import { createMockClient, createMockContext, createSuccessResponse } from '../helpers/mocks.js';

describe('explain_query tool', () => {
    test('returns JSON plan for SELECT query', async () => {
        const mockClient = createMockClient({
            pgAvailable: true,
            pgResult: createSuccessResponse([
                { 'QUERY PLAN': [{ 'Plan': { 'Node Type': 'Seq Scan' } }] },
            ]),
        });
        const context = createMockContext(mockClient);

        const result = await explainQueryTool.execute(
            { sql: 'SELECT * FROM users', analyze: false, format: 'json', verbose: false, costs: true, buffers: false, timing: true, settings: false },
            context
        );

        expect(result).toBeDefined();
        expect(result.query).toBe('SELECT * FROM users');
        expect(result.format).toBe('json');
        expect(result.analyzed).toBe(false);
    });

    test('detects write query with ANALYZE and adds warning', async () => {
        const mockClient = createMockClient({
            pgAvailable: true,
            pgResult: createSuccessResponse([
                { 'QUERY PLAN': [{ 'Plan': { 'Node Type': 'ModifyTable' } }] },
            ]),
        });
        const context = createMockContext(mockClient);

        const result = await explainQueryTool.execute(
            { sql: 'INSERT INTO users (email) VALUES (\'test@example.com\')', analyze: true, format: 'json', verbose: false, costs: true, buffers: false, timing: true, settings: false },
            context
        );

        expect(result.warnings).toBeDefined();
        expect(result.warnings?.length).toBeGreaterThan(0);
        expect(result.warnings?.[0]).toContain('CRITICAL');
    });

    test('detects UPDATE as write query', async () => {
        const mockClient = createMockClient({
            pgAvailable: true,
            pgResult: createSuccessResponse([{ 'QUERY PLAN': ['Plan'] }]),
        });
        const context = createMockContext(mockClient);

        const result = await explainQueryTool.execute(
            { sql: 'UPDATE users SET email = \'new@example.com\'', analyze: true, format: 'text', verbose: false, costs: true, buffers: false, timing: true, settings: false },
            context
        );

        expect(result.warnings).toBeDefined();
        expect(result.warnings?.[0]).toContain('UPDATE');
    });

    test('detects DELETE as write query', async () => {
        const mockClient = createMockClient({
            pgAvailable: true,
            pgResult: createSuccessResponse([{ 'QUERY PLAN': ['Plan'] }]),
        });
        const context = createMockContext(mockClient);

        const result = await explainQueryTool.execute(
            { sql: 'DELETE FROM users WHERE id = 1', analyze: true, format: 'text', verbose: false, costs: true, buffers: false, timing: true, settings: false },
            context
        );

        expect(result.warnings).toBeDefined();
        expect(result.warnings?.[0]).toContain('DELETE');
    });

    test('does not flag SELECT as write query', async () => {
        const mockClient = createMockClient({
            pgAvailable: true,
            pgResult: createSuccessResponse([{ 'QUERY PLAN': ['Plan'] }]),
        });
        const context = createMockContext(mockClient);

        const result = await explainQueryTool.execute(
            { sql: 'SELECT * FROM users', analyze: true, format: 'text', verbose: false, costs: true, buffers: false, timing: true, settings: false },
            context
        );

        expect(result.warnings).toBeDefined();
        expect(result.warnings?.[0]).not.toContain('CRITICAL');
    });

    test('returns text format plan', async () => {
        const mockClient = createMockClient({
            pgAvailable: true,
            pgResult: createSuccessResponse([
                { 'QUERY PLAN': 'Seq Scan on users' },
                { 'QUERY PLAN': '  Filter: (id = 1)' },
            ]),
        });
        const context = createMockContext(mockClient);

        const result = await explainQueryTool.execute(
            { sql: 'SELECT * FROM users WHERE id = 1', analyze: false, format: 'text', verbose: false, costs: true, buffers: false, timing: true, settings: false },
            context
        );

        expect(Array.isArray(result.plan)).toBe(true);
        expect(result.format).toBe('text');
    });
});
