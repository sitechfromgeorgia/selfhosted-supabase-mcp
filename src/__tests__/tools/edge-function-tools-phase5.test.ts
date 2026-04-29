/**
 * Unit tests for Phase 5 Edge Function Deployment tools.
 */

import { describe, test, expect } from 'bun:test';
import { deployEdgeFunctionTool } from '../../tools/deploy_edge_function.js';
import { updateEdgeFunctionTool } from '../../tools/update_edge_function.js';
import { deleteEdgeFunctionTool } from '../../tools/delete_edge_function.js';
import { invokeEdgeFunctionTool } from '../../tools/invoke_edge_function.js';
import { listEdgeFunctionSecretsTool } from '../../tools/list_edge_function_secrets.js';
import { setEdgeFunctionSecretTool } from '../../tools/set_edge_function_secret.js';

// ------------------------------------------------------------------
// Privilege level tests
// ------------------------------------------------------------------
describe('Edge Function Phase 5 tool privilege levels', () => {
    test('deploy_edge_function is privileged', () => {
        expect(deployEdgeFunctionTool.privilegeLevel).toBe('privileged');
    });

    test('update_edge_function is privileged', () => {
        expect(updateEdgeFunctionTool.privilegeLevel).toBe('privileged');
    });

    test('delete_edge_function is privileged', () => {
        expect(deleteEdgeFunctionTool.privilegeLevel).toBe('privileged');
    });

    test('invoke_edge_function is regular', () => {
        expect(invokeEdgeFunctionTool.privilegeLevel).toBe('regular');
    });

    test('list_edge_function_secrets is regular', () => {
        expect(listEdgeFunctionSecretsTool.privilegeLevel).toBe('regular');
    });

    test('set_edge_function_secret is privileged', () => {
        expect(setEdgeFunctionSecretTool.privilegeLevel).toBe('privileged');
    });
});

// ------------------------------------------------------------------
// deploy_edge_function tests
// ------------------------------------------------------------------
describe('deploy_edge_function tool', () => {
    test('dry-run returns note about CLI requirement', async () => {
        const result = await deployEdgeFunctionTool.execute(
            { name: 'hello-world', slug: 'hello-world', dry_run: true } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.note).toContain('Supabase CLI');
        expect(result.message).toContain('DRY RUN');
    });

    test('rejects without pg connection', async () => {
        await expect(
            deployEdgeFunctionTool.execute(
                { name: 'test', slug: 'test', dry_run: true } as any,
                mockContextNoPg()
            )
        ).rejects.toThrow('DATABASE_URL');
    });
});

// ------------------------------------------------------------------
// update_edge_function tests
// ------------------------------------------------------------------
describe('update_edge_function tool', () => {
    test('returns note about CLI for code updates', async () => {
        const result = await updateEdgeFunctionTool.execute(
            { slug: 'hello-world', verify_jwt: false, dry_run: true } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.note).toContain('CLI');
    });

    test('returns no-op when no fields provided', async () => {
        const result = await updateEdgeFunctionTool.execute(
            { slug: 'hello-world', dry_run: true } as any,
            mockContext()
        );

        expect(result.message).toContain('No fields');
    });
});

// ------------------------------------------------------------------
// delete_edge_function tests
// ------------------------------------------------------------------
describe('delete_edge_function tool', () => {
    test('dry-run returns warning', async () => {
        const result = await deleteEdgeFunctionTool.execute(
            { slug: 'old-function', dry_run: true } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.warning).toContain('Code files');
    });
});

// ------------------------------------------------------------------
// invoke_edge_function tests
// ------------------------------------------------------------------
describe('invoke_edge_function tool', () => {
    test('requires supabase client', async () => {
        await expect(
            invokeEdgeFunctionTool.execute(
                { function_name: 'hello-world' } as any,
                mockContextNoClient()
            )
        ).rejects.toThrow('Supabase client');
    });
});

// ------------------------------------------------------------------
// list_edge_function_secrets tests
// ------------------------------------------------------------------
describe('list_edge_function_secrets tool', () => {
    test('is regular privilege', () => {
        expect(listEdgeFunctionSecretsTool.privilegeLevel).toBe('regular');
    });

    test('returns empty on missing table', async () => {
        const result = await listEdgeFunctionSecretsTool.execute(
            {} as any,
            mockContextWithError('relation "supabase_functions.secrets" does not exist')
        );

        expect(result.success).toBe(true);
        expect(result.secrets).toHaveLength(0);
    });
});

// ------------------------------------------------------------------
// set_edge_function_secret tests
// ------------------------------------------------------------------
describe('set_edge_function_secret tool', () => {
    test('dry-run returns preview', async () => {
        const result = await setEdgeFunctionSecretTool.execute(
            { name: 'API_KEY', value: 'secret123', dry_run: true } as any,
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
            executeSqlWithPg: () => Promise.resolve([{ id: 'test' }]),
            getServiceRoleClient: () => ({
                functions: {
                    invoke: () => Promise.resolve({ data: {}, error: null }),
                },
            }),
            supabase: null,
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

function mockContextNoClient(): any {
    return {
        selfhostedClient: {
            getServiceRoleClient: () => null,
            supabase: null,
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
