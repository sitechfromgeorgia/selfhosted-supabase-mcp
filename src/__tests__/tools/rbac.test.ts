import { describe, test, expect } from 'bun:test';
import { canAccessTool } from '../../tools/types.js';

describe('RBAC - canAccessTool', () => {
    describe('service_role', () => {
        test('can access regular tools', () => {
            expect(canAccessTool('service_role', 'regular')).toBe(true);
        });

        test('can access privileged tools', () => {
            expect(canAccessTool('service_role', 'privileged')).toBe(true);
        });
    });

    describe('authenticated', () => {
        test('can access regular tools', () => {
            expect(canAccessTool('authenticated', 'regular')).toBe(true);
        });

        test('cannot access privileged tools', () => {
            expect(canAccessTool('authenticated', 'privileged')).toBe(false);
        });
    });

    describe('anon', () => {
        test('cannot access regular tools', () => {
            expect(canAccessTool('anon', 'regular')).toBe(false);
        });

        test('cannot access privileged tools', () => {
            expect(canAccessTool('anon', 'privileged')).toBe(false);
        });
    });

    describe('unknown roles', () => {
        test('defaults to regular access only', () => {
            expect(canAccessTool('unknown_role', 'regular')).toBe(true);
            expect(canAccessTool('unknown_role', 'privileged')).toBe(false);
        });

        test('empty string role defaults to regular', () => {
            expect(canAccessTool('', 'regular')).toBe(true);
            expect(canAccessTool('', 'privileged')).toBe(false);
        });
    });
});
