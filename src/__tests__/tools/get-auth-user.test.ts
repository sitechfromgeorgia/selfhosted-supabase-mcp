import { describe, test, expect } from 'bun:test';
import { getAuthUserTool } from '../../tools/get_auth_user.js';
import { createMockClient, createMockContext } from '../helpers/mocks.js';

describe('get_auth_user tool', () => {
    test('returns user when found', async () => {
        const userId = '550e8400-e29b-41d4-a716-446655440001';
        const mockClient = createMockClient({ pgAvailable: true });
        // Override executeTransactionWithPg to return a user
        (mockClient.executeTransactionWithPg as any) = async <T>(callback: (client: unknown) => Promise<T>) => {
            const mockPgClient = {
                query: async () => ({
                    rows: [{
                        id: userId,
                        email: 'test@example.com',
                        role: 'authenticated',
                        raw_app_meta_data: {},
                        raw_user_meta_data: {},
                        created_at: '2024-01-01T00:00:00Z',
                        last_sign_in_at: '2024-01-02T00:00:00Z',
                    }],
                }),
            };
            return callback(mockPgClient);
        };
        const context = createMockContext(mockClient);

        const result = await getAuthUserTool.execute({ user_id: userId }, context);

        expect(result.id).toBe(userId);
        expect(result.email).toBe('test@example.com');
        expect(result.role).toBe('authenticated');
    });

    test('throws error when user not found', async () => {
        const userId = '550e8400-e29b-41d4-a716-446655440999';
        const mockClient = createMockClient({ pgAvailable: true });
        (mockClient.executeTransactionWithPg as any) = async <T>(callback: (client: unknown) => Promise<T>) => {
            const mockPgClient = {
                query: async () => ({ rows: [] }),
            };
            return callback(mockPgClient);
        };
        const context = createMockContext(mockClient);

        expect(getAuthUserTool.execute({ user_id: userId }, context)).rejects.toThrow('not found');
    });

    test('throws error when pg is not available', async () => {
        const mockClient = createMockClient({ pgAvailable: false, serviceRoleAvailable: false });
        const context = createMockContext(mockClient);

        expect(
            getAuthUserTool.execute(
                { user_id: '550e8400-e29b-41d4-a716-446655440001' },
                context
            )
        ).rejects.toThrow('Neither Supabase service role key (for Admin API) nor direct database connection (DATABASE_URL) is available. Cannot get auth user.');
    });

    test('throws error for invalid UUID', async () => {
        const mockClient = createMockClient({ pgAvailable: true });
        const context = createMockContext(mockClient);

        expect(
            getAuthUserTool.execute(
                { user_id: 'not-a-valid-uuid' },
                context
            )
        ).rejects.toThrow();
    });
});
