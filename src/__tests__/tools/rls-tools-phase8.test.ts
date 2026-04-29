/**
 * Unit tests for Phase 8 RLS Policy Management tools.
 */

import { describe, test, expect } from 'bun:test';
import { createRlsPolicyTool } from '../../tools/create_rls_policy.js';
import { deleteRlsPolicyTool } from '../../tools/delete_rls_policy.js';
import { updateRlsPolicyTool } from '../../tools/update_rls_policy.js';
import { enableRlsTool } from '../../tools/enable_rls.js';
import { disableRlsTool } from '../../tools/disable_rls.js';
import { forceRlsTool } from '../../tools/force_rls.js';

// ------------------------------------------------------------------
// Privilege level tests
// ------------------------------------------------------------------
describe('RLS Phase 8 tool privilege levels', () => {
    test('create_rls_policy is privileged', () => {
        expect(createRlsPolicyTool.privilegeLevel).toBe('privileged');
    });

    test('delete_rls_policy is privileged', () => {
        expect(deleteRlsPolicyTool.privilegeLevel).toBe('privileged');
    });

    test('update_rls_policy is privileged', () => {
        expect(updateRlsPolicyTool.privilegeLevel).toBe('privileged');
    });

    test('enable_rls is privileged', () => {
        expect(enableRlsTool.privilegeLevel).toBe('privileged');
    });

    test('disable_rls is privileged', () => {
        expect(disableRlsTool.privilegeLevel).toBe('privileged');
    });

    test('force_rls is privileged', () => {
        expect(forceRlsTool.privilegeLevel).toBe('privileged');
    });
});

// ------------------------------------------------------------------
// create_rls_policy tests
// ------------------------------------------------------------------
describe('create_rls_policy tool', () => {
    test('rejects without using or with_check', async () => {
        await expect(
            createRlsPolicyTool.execute(
                { schema: 'public', table: 'users', policy_name: 'test_policy', dry_run: true } as any,
                mockContext()
            )
        ).rejects.toThrow('At least one of');
    });

    test('generates CREATE POLICY SQL with USING', async () => {
        const result = await createRlsPolicyTool.execute(
            { schema: 'public', table: 'users', policy_name: 'users_select', command: 'SELECT', role: 'authenticated', using: 'auth.uid() = user_id', dry_run: true } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.sql).toContain('CREATE POLICY users_select');
        expect(result.sql).toContain('FOR SELECT');
        expect(result.sql).toContain('TO authenticated');
        expect(result.sql).toContain('USING (auth.uid() = user_id)');
    });

    test('generates CREATE POLICY SQL with WITH CHECK', async () => {
        const result = await createRlsPolicyTool.execute(
            { schema: 'public', table: 'users', policy_name: 'users_insert', command: 'INSERT', role: 'authenticated', with_check: 'auth.uid() = user_id', dry_run: true } as any,
            mockContext()
        );

        expect(result.sql).toContain('WITH CHECK (auth.uid() = user_id)');
    });
});

// ------------------------------------------------------------------
// delete_rls_policy tests
// ------------------------------------------------------------------
describe('delete_rls_policy tool', () => {
    test('generates DROP POLICY SQL', async () => {
        const result = await deleteRlsPolicyTool.execute(
            { schema: 'public', table: 'users', policy_name: 'old_policy', dry_run: true } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.sql).toContain('DROP POLICY IF EXISTS old_policy ON public.users');
    });
});

// ------------------------------------------------------------------
// update_rls_policy tests
// ------------------------------------------------------------------
describe('update_rls_policy tool', () => {
    test('generates RENAME SQL', async () => {
        const result = await updateRlsPolicyTool.execute(
            { schema: 'public', table: 'users', policy_name: 'old_name', new_name: 'new_name', dry_run: true } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.sql).toContain('RENAME TO new_name');
    });

    test('generates full ALTER POLICY SQL', async () => {
        const result = await updateRlsPolicyTool.execute(
            { schema: 'public', table: 'users', policy_name: 'users_select', command: 'ALL', role: 'public', using: 'true', with_check: 'true', dry_run: true } as any,
            mockContext()
        );

        expect(result.sql).toContain('ALTER POLICY users_select');
        expect(result.sql).toContain('FOR ALL');
        expect(result.sql).toContain('TO public');
        expect(result.sql).toContain('USING (true)');
        expect(result.sql).toContain('WITH CHECK (true)');
    });
});

// ------------------------------------------------------------------
// enable_rls tests
// ------------------------------------------------------------------
describe('enable_rls tool', () => {
    test('generates ENABLE ROW LEVEL SECURITY SQL', async () => {
        const result = await enableRlsTool.execute(
            { schema: 'public', table: 'users', dry_run: true } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.sql).toContain('ENABLE ROW LEVEL SECURITY');
    });

    test('generates FORCE ROW LEVEL SECURITY SQL', async () => {
        const result = await enableRlsTool.execute(
            { schema: 'public', table: 'users', force: true, dry_run: true } as any,
            mockContext()
        );

        expect(result.sql).toContain('FORCE ROW LEVEL SECURITY');
    });
});

// ------------------------------------------------------------------
// disable_rls tests
// ------------------------------------------------------------------
describe('disable_rls tool', () => {
    test('generates DISABLE ROW LEVEL SECURITY SQL with warning', async () => {
        const result = await disableRlsTool.execute(
            { schema: 'public', table: 'users', dry_run: true } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.sql).toContain('DISABLE ROW LEVEL SECURITY');
        expect(result.warning).toContain('WARNING');
    });
});

// ------------------------------------------------------------------
// force_rls tests
// ------------------------------------------------------------------
describe('force_rls tool', () => {
    test('generates FORCE ROW LEVEL SECURITY SQL', async () => {
        const result = await forceRlsTool.execute(
            { schema: 'public', table: 'users', dry_run: true } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.sql).toContain('FORCE ROW LEVEL SECURITY');
    });
});

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function mockContext(): any {
    return {
        selfhostedClient: {
            isPgAvailable: () => true,
            executeSqlWithPg: () => Promise.resolve([{}]),
        },
        workspacePath: '/tmp',
        user: undefined,
        log: () => {},
    };
}
