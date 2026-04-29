/**
 * Unit tests for Phase 3 Auth at Scale tools.
 */

import { describe, test, expect } from 'bun:test';
import { bulkCreateAuthUsersTool } from '../../tools/bulk_create_auth_users.js';
import { bulkDeleteAuthUsersTool } from '../../tools/bulk_delete_auth_users.js';
import { bulkUpdateAuthUsersTool } from '../../tools/bulk_update_auth_users.js';
import { sendPasswordResetTool } from '../../tools/send_password_reset.js';
import { inviteUserTool } from '../../tools/invite_user.js';
import { confirmUserEmailTool } from '../../tools/confirm_user_email.js';
import { banUserTool } from '../../tools/ban_user.js';
import { unbanUserTool } from '../../tools/unban_user.js';
import { listUserSessionsTool } from '../../tools/list_user_sessions.js';
import { revokeUserSessionsTool } from '../../tools/revoke_user_sessions.js';
import { getAuthSettingsTool } from '../../tools/get_auth_settings.js';
import { updateAuthSettingsTool } from '../../tools/update_auth_settings.js';
import { createRoleTool } from '../../tools/create_role.js';
import { listRolesTool } from '../../tools/list_roles.js';

// ------------------------------------------------------------------
// Privilege level tests
// ------------------------------------------------------------------
describe('Auth Phase 3 tool privilege levels', () => {
    test('bulk_create_auth_users is privileged', () => {
        expect(bulkCreateAuthUsersTool.privilegeLevel).toBe('privileged');
    });

    test('bulk_delete_auth_users is privileged', () => {
        expect(bulkDeleteAuthUsersTool.privilegeLevel).toBe('privileged');
    });

    test('bulk_update_auth_users is privileged', () => {
        expect(bulkUpdateAuthUsersTool.privilegeLevel).toBe('privileged');
    });

    test('send_password_reset is privileged', () => {
        expect(sendPasswordResetTool.privilegeLevel).toBe('privileged');
    });

    test('invite_user is privileged', () => {
        expect(inviteUserTool.privilegeLevel).toBe('privileged');
    });

    test('confirm_user_email is privileged', () => {
        expect(confirmUserEmailTool.privilegeLevel).toBe('privileged');
    });

    test('ban_user is privileged', () => {
        expect(banUserTool.privilegeLevel).toBe('privileged');
    });

    test('unban_user is privileged', () => {
        expect(unbanUserTool.privilegeLevel).toBe('privileged');
    });

    test('list_user_sessions is regular', () => {
        expect(listUserSessionsTool.privilegeLevel).toBe('regular');
    });

    test('revoke_user_sessions is privileged', () => {
        expect(revokeUserSessionsTool.privilegeLevel).toBe('privileged');
    });

    test('get_auth_settings is regular', () => {
        expect(getAuthSettingsTool.privilegeLevel).toBe('regular');
    });

    test('update_auth_settings is privileged', () => {
        expect(updateAuthSettingsTool.privilegeLevel).toBe('privileged');
    });

    test('create_role is privileged', () => {
        expect(createRoleTool.privilegeLevel).toBe('privileged');
    });

    test('list_roles is regular', () => {
        expect(listRolesTool.privilegeLevel).toBe('regular');
    });
});

// ------------------------------------------------------------------
// bulk_create_auth_users tests
// ------------------------------------------------------------------
describe('bulk_create_auth_users tool', () => {
    test('respects max batch size', () => {
        const tooMany = Array.from({ length: 101 }, (_, i) => ({
            email: `user${i}@test.com`,
            password: 'password123',
        }));
        const parsed = bulkCreateAuthUsersTool.inputSchema.safeParse({ users: tooMany });
        expect(parsed.success).toBe(false);
    });

    test('dry-run returns preview', async () => {
        const result = await bulkCreateAuthUsersTool.execute(
            {
                users: [{ email: 'test@test.com', password: 'password123' }],
                dry_run: true,
            } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.message).toContain('DRY RUN');
        expect(result.created_count).toBe(0);
    });

    test('rejects without pg connection', async () => {
        await expect(
            bulkCreateAuthUsersTool.execute(
                { users: [{ email: 'test@test.com', password: 'password123' }] } as any,
                mockContextNoPg()
            )
        ).rejects.toThrow('DATABASE_URL');
    });
});

// ------------------------------------------------------------------
// bulk_delete_auth_users tests
// ------------------------------------------------------------------
describe('bulk_delete_auth_users tool', () => {
    test('dry-run returns preview', async () => {
        const result = await bulkDeleteAuthUsersTool.execute(
            { user_ids: ['550e8400-e29b-41d4-a716-446655440000'], dry_run: true } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.message).toContain('DRY RUN');
    });
});

// ------------------------------------------------------------------
// bulk_update_auth_users tests
// ------------------------------------------------------------------
describe('bulk_update_auth_users tool', () => {
    test('dry-run returns preview', async () => {
        const result = await bulkUpdateAuthUsersTool.execute(
            {
                updates: [{ user_id: '550e8400-e29b-41d4-a716-446655440000', role: 'admin' }],
                dry_run: true,
            } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.message).toContain('DRY RUN');
    });
});

// ------------------------------------------------------------------
// send_password_reset tests
// ------------------------------------------------------------------
describe('send_password_reset tool', () => {
    test('requires service role', async () => {
        await expect(
            sendPasswordResetTool.execute(
                { email: 'test@test.com', dry_run: true } as any,
                mockContextNoServiceRole()
            )
        ).rejects.toThrow('Service role key');
    });

    test('dry-run returns preview', async () => {
        const result = await sendPasswordResetTool.execute(
            { email: 'test@test.com', dry_run: true } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.message).toContain('DRY RUN');
    });
});

// ------------------------------------------------------------------
// invite_user tests
// ------------------------------------------------------------------
describe('invite_user tool', () => {
    test('requires service role', async () => {
        await expect(
            inviteUserTool.execute(
                { email: 'test@test.com', dry_run: true } as any,
                mockContextNoServiceRole()
            )
        ).rejects.toThrow('Service role key');
    });
});

// ------------------------------------------------------------------
// confirm_user_email tests
// ------------------------------------------------------------------
describe('confirm_user_email tool', () => {
    test('dry-run returns preview', async () => {
        const result = await confirmUserEmailTool.execute(
            { user_id: '550e8400-e29b-41d4-a716-446655440000', dry_run: true } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.message).toContain('DRY RUN');
    });
});

// ------------------------------------------------------------------
// ban_user tests
// ------------------------------------------------------------------
describe('ban_user tool', () => {
    test('sets permanent ban by default', async () => {
        const result = await banUserTool.execute(
            { user_id: '550e8400-e29b-41d4-a716-446655440000', dry_run: true } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.banned_until).toBe('9999-12-31T23:59:59Z');
    });

    test('supports custom expiry', async () => {
        const result = await banUserTool.execute(
            { user_id: '550e8400-e29b-41d4-a716-446655440000', banned_until: '2025-12-31T00:00:00Z', dry_run: true } as any,
            mockContext()
        );

        expect(result.banned_until).toBe('2025-12-31T00:00:00Z');
    });
});

// ------------------------------------------------------------------
// unban_user tests
// ------------------------------------------------------------------
describe('unban_user tool', () => {
    test('dry-run returns preview', async () => {
        const result = await unbanUserTool.execute(
            { user_id: '550e8400-e29b-41d4-a716-446655440000', dry_run: true } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.message).toContain('DRY RUN');
    });
});

// ------------------------------------------------------------------
// list_user_sessions tests
// ------------------------------------------------------------------
describe('list_user_sessions tool', () => {
    test('is regular privilege', () => {
        expect(listUserSessionsTool.privilegeLevel).toBe('regular');
    });
});

// ------------------------------------------------------------------
// revoke_user_sessions tests
// ------------------------------------------------------------------
describe('revoke_user_sessions tool', () => {
    test('dry-run returns preview', async () => {
        const result = await revokeUserSessionsTool.execute(
            { user_id: '550e8400-e29b-41d4-a716-446655440000', dry_run: true } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.message).toContain('DRY RUN');
    });
});

// ------------------------------------------------------------------
// get_auth_settings tests
// ------------------------------------------------------------------
describe('get_auth_settings tool', () => {
    test('is regular privilege', () => {
        expect(getAuthSettingsTool.privilegeLevel).toBe('regular');
    });
});

// ------------------------------------------------------------------
// update_auth_settings tests
// ------------------------------------------------------------------
describe('update_auth_settings tool', () => {
    test('dry-run returns preview', async () => {
        const result = await updateAuthSettingsTool.execute(
            { site_url: 'https://example.com', dry_run: true } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.message).toContain('DRY RUN');
    });
});

// ------------------------------------------------------------------
// create_role tests
// ------------------------------------------------------------------
describe('create_role tool', () => {
    test('rejects invalid role name', async () => {
        await expect(
            createRoleTool.execute(
                { role_name: 'select', dry_run: true } as any,
                mockContext()
            )
        ).rejects.toThrow('reserved');
    });

    test('rejects without pg connection', async () => {
        await expect(
            createRoleTool.execute(
                { role_name: 'app_readonly', dry_run: true } as any,
                mockContextNoPg()
            )
        ).rejects.toThrow('DATABASE_URL');
    });
});

// ------------------------------------------------------------------
// list_roles tests
// ------------------------------------------------------------------
describe('list_roles tool', () => {
    test('is regular privilege', () => {
        expect(listRolesTool.privilegeLevel).toBe('regular');
    });
});

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function mockContext(): any {
    return {
        selfhostedClient: {
            isPgAvailable: () => true,
            executeSqlWithPg: () => Promise.resolve([{ id: '550e8400-e29b-41d4-a716-446655440000', banned_until: '9999-12-31T23:59:59Z' }]),
            executeTransactionWithPg: (fn: any) => {
                const mockPg = {
                    query: () => Promise.resolve({ rows: [{ id: '550e8400-e29b-41d4-a716-446655440000' }], rowCount: 1 }),
                };
                return fn(mockPg);
            },
            getServiceRoleClient: () => ({
                auth: {
                    resetPasswordForEmail: () => Promise.resolve({ data: {}, error: null }),
                    inviteUserByEmail: () => Promise.resolve({ data: { user: { id: 'test-id' } }, error: null }),
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
            getServiceRoleClient: () => null,
            supabase: null,
        },
        workspacePath: '/tmp',
        user: undefined,
        log: () => {},
    };
}

function mockContextNoServiceRole(): any {
    return {
        selfhostedClient: {
            isPgAvailable: () => true,
            getServiceRoleClient: () => null,
            supabase: null,
        },
        workspacePath: '/tmp',
        user: undefined,
        log: () => {},
    };
}
