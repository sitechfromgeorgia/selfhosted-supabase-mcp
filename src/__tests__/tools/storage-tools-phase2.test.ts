/**
 * Unit tests for Phase 2 Storage File Operations tools.
 *
 * Tests focus on:
 * - Input validation
 * - Privilege levels
 * - Dry-run mode
 * - Error handling (missing service role)
 */

import { describe, test, expect } from 'bun:test';
import { createStorageBucketTool } from '../../tools/create_storage_bucket.js';
import { deleteStorageBucketTool } from '../../tools/delete_storage_bucket.js';
import { uploadFileTool } from '../../tools/upload_file.js';
import { downloadFileTool } from '../../tools/download_file.js';
import { deleteStorageObjectTool } from '../../tools/delete_storage_object.js';
import { moveStorageObjectTool } from '../../tools/move_storage_object.js';
import { copyStorageObjectTool } from '../../tools/copy_storage_object.js';
import { getStorageObjectMetadataTool } from '../../tools/get_storage_object_metadata.js';
import { createSignedUrlTool } from '../../tools/create_signed_url.js';
import { emptyStorageBucketTool } from '../../tools/empty_storage_bucket.js';

// ------------------------------------------------------------------
// Privilege level tests
// ------------------------------------------------------------------
describe('Storage Phase 2 tool privilege levels', () => {
    test('create_storage_bucket is privileged', () => {
        expect(createStorageBucketTool.privilegeLevel).toBe('privileged');
    });

    test('delete_storage_bucket is privileged', () => {
        expect(deleteStorageBucketTool.privilegeLevel).toBe('privileged');
    });

    test('upload_file is privileged', () => {
        expect(uploadFileTool.privilegeLevel).toBe('privileged');
    });

    test('download_file is regular', () => {
        expect(downloadFileTool.privilegeLevel).toBe('regular');
    });

    test('delete_storage_object is privileged', () => {
        expect(deleteStorageObjectTool.privilegeLevel).toBe('privileged');
    });

    test('move_storage_object is privileged', () => {
        expect(moveStorageObjectTool.privilegeLevel).toBe('privileged');
    });

    test('copy_storage_object is privileged', () => {
        expect(copyStorageObjectTool.privilegeLevel).toBe('privileged');
    });

    test('get_storage_object_metadata is regular', () => {
        expect(getStorageObjectMetadataTool.privilegeLevel).toBe('regular');
    });

    test('create_signed_url is privileged', () => {
        expect(createSignedUrlTool.privilegeLevel).toBe('privileged');
    });

    test('empty_storage_bucket is privileged', () => {
        expect(emptyStorageBucketTool.privilegeLevel).toBe('privileged');
    });
});

// ------------------------------------------------------------------
// create_storage_bucket tests
// ------------------------------------------------------------------
describe('create_storage_bucket tool', () => {
    test('rejects invalid bucket name', async () => {
        await expect(
            createStorageBucketTool.execute(
                { name: 'my bucket!', public: false, dry_run: true } as any,
                mockContext()
            )
        ).rejects.toThrow('Invalid bucket name');
    });

    test('returns dry-run preview', async () => {
        const result = await createStorageBucketTool.execute(
            { name: 'avatars', public: true, dry_run: true } as any,
            mockContextWithServiceRole()
        );

        expect(result.success).toBe(true);
        expect(result.message).toContain('DRY RUN');
        expect(result.bucket_name).toBe('avatars');
    });

    test('throws without service role', async () => {
        await expect(
            createStorageBucketTool.execute(
                { name: 'avatars', public: false, dry_run: true } as any,
                mockContext()
            )
        ).rejects.toThrow('Service role key is required');
    });
});

// ------------------------------------------------------------------
// delete_storage_bucket tests
// ------------------------------------------------------------------
describe('delete_storage_bucket tool', () => {
    test('returns dry-run with warning', async () => {
        const result = await deleteStorageBucketTool.execute(
            { name: 'old-bucket', dry_run: true } as any,
            mockContextWithServiceRole()
        );

        expect(result.success).toBe(true);
        expect(result.warning).toContain('permanently delete');
    });
});

// ------------------------------------------------------------------
// upload_file tests
// ------------------------------------------------------------------
describe('upload_file tool', () => {
    test('rejects empty content', async () => {
        await expect(
            uploadFileTool.execute(
                { bucket: 'avatars', path: 'test.txt', content: '', dry_run: true } as any,
                mockContextWithServiceRole()
            )
        ).rejects.toThrow('File content is empty');
    });

    test('returns dry-run with size info', async () => {
        const result = await uploadFileTool.execute(
            { bucket: 'avatars', path: 'photo.png', content: 'aGVsbG8=', content_type: 'image/png', dry_run: true } as any,
            mockContextWithServiceRole()
        );

        expect(result.success).toBe(true);
        expect(result.size).toBe(5); // "hello" base64 = 5 bytes
        expect(result.message).toContain('DRY RUN');
    });

    test('handles text encoding', async () => {
        const result = await uploadFileTool.execute(
            { bucket: 'docs', path: 'readme.txt', content: 'Hello World', encoding: 'text', dry_run: true } as any,
            mockContextWithServiceRole()
        );

        expect(result.success).toBe(true);
        expect(result.size).toBe(11);
    });
});

// ------------------------------------------------------------------
// download_file tests
// ------------------------------------------------------------------
describe('download_file tool', () => {
    test('requires supabase client', async () => {
        await expect(
            downloadFileTool.execute(
                { bucket: 'avatars', path: 'photo.png' } as any,
                mockContext() // no service role, no supabase
            )
        ).rejects.toThrow('Supabase client is not available');
    });
});

// ------------------------------------------------------------------
// delete_storage_object tests
// ------------------------------------------------------------------
describe('delete_storage_object tool', () => {
    test('returns dry-run preview', async () => {
        const result = await deleteStorageObjectTool.execute(
            { bucket: 'avatars', path: 'old.png', dry_run: true } as any,
            mockContextWithServiceRole()
        );

        expect(result.success).toBe(true);
        expect(result.message).toContain('DRY RUN');
    });
});

// ------------------------------------------------------------------
// move_storage_object tests
// ------------------------------------------------------------------
describe('move_storage_object tool', () => {
    test('returns dry-run with source/destination', async () => {
        const result = await moveStorageObjectTool.execute(
            { source_bucket: 'temp', source_path: 'file.txt', destination_path: 'archive/file.txt', dry_run: true } as any,
            mockContextWithServiceRole()
        );

        expect(result.success).toBe(true);
        expect(result.source).toContain('temp/file.txt');
        expect(result.destination).toContain('archive/file.txt');
    });
});

// ------------------------------------------------------------------
// copy_storage_object tests
// ------------------------------------------------------------------
describe('copy_storage_object tool', () => {
    test('returns dry-run preview', async () => {
        const result = await copyStorageObjectTool.execute(
            { source_bucket: 'avatars', source_path: 'photo.png', destination_path: 'backup/photo.png', dry_run: true } as any,
            mockContextWithServiceRole()
        );

        expect(result.success).toBe(true);
        expect(result.source).toContain('avatars/photo.png');
    });
});

// ------------------------------------------------------------------
// get_storage_object_metadata tests
// ------------------------------------------------------------------
describe('get_storage_object_metadata tool', () => {
    test('is regular privilege level', () => {
        expect(getStorageObjectMetadataTool.privilegeLevel).toBe('regular');
    });
});

// ------------------------------------------------------------------
// create_signed_url tests
// ------------------------------------------------------------------
describe('create_signed_url tool', () => {
    test('respects max expiry limit', async () => {
        // Input validation should reject > 604800
        const parsed = createSignedUrlTool.inputSchema.safeParse({
            bucket: 'avatars', path: 'photo.png', expiry_seconds: 999999,
        });
        expect(parsed.success).toBe(false);
    });

    test('returns dry-run preview', async () => {
        const result = await createSignedUrlTool.execute(
            { bucket: 'avatars', path: 'photo.png', expiry_seconds: 3600, dry_run: true } as any,
            mockContextWithServiceRole()
        );

        expect(result.success).toBe(true);
        expect(result.signed_url).toContain('DRY RUN');
        expect(result.expires_at).toBeDefined();
    });
});

// ------------------------------------------------------------------
// empty_storage_bucket tests
// ------------------------------------------------------------------
describe('empty_storage_bucket tool', () => {
    test('returns dry-run with warning', async () => {
        const result = await emptyStorageBucketTool.execute(
            { bucket: 'temp-files', dry_run: true } as any,
            mockContextWithServiceRole()
        );

        expect(result.success).toBe(true);
        expect(result.warning).toContain('permanently delete');
    });
});

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function mockContext(): any {
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

function mockContextWithServiceRole(): any {
    const mockStorage = {
        createBucket: () => Promise.resolve({ data: {}, error: null }),
        deleteBucket: () => Promise.resolve({ data: {}, error: null }),
        emptyBucket: () => Promise.resolve({ data: {}, error: null }),
        from: () => ({
            upload: () => Promise.resolve({ data: {}, error: null }),
            download: () => Promise.resolve({ data: new Blob(['hello']), error: null }),
            remove: () => Promise.resolve({ data: {}, error: null }),
            move: () => Promise.resolve({ data: {}, error: null }),
            copy: () => Promise.resolve({ data: {}, error: null }),
            list: () => Promise.resolve({
                data: [{ name: 'file.txt', metadata: { size: 5, mimetype: 'text/plain' }, created_at: '2024-01-01' }],
                error: null,
            }),
            createSignedUrl: () => Promise.resolve({ data: { signedUrl: 'https://example.com/signed' }, error: null }),
        }),
    };

    return {
        selfhostedClient: {
            getServiceRoleClient: () => ({ storage: mockStorage }),
            supabase: { storage: mockStorage },
        },
        workspacePath: '/tmp',
        user: undefined,
        log: () => {},
    };
}
