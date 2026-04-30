/**
 * Unit tests for DDL tools (create_table, alter_table, drop_table,
 * create_index, drop_index, add_foreign_key, drop_foreign_key).
 *
 * Tests focus on:
 * - Identifier validation (SQL injection prevention)
 * - SQL generation correctness
 * - Dry-run mode
 * - Privilege level assignment
 */

import { describe, test, expect } from 'bun:test';
import { createTableTool } from '../../tools/create_table.js';
import { alterTableTool } from '../../tools/alter_table.js';
import { dropTableTool } from '../../tools/drop_table.js';
import { createIndexTool } from '../../tools/create_index.js';
import { dropIndexTool } from '../../tools/drop_index.js';
import { addForeignKeyTool } from '../../tools/add_foreign_key.js';
import { dropForeignKeyTool } from '../../tools/drop_foreign_key.js';
import { renameTableTool } from '../../tools/rename_table.js';
import { createSchemaTool } from '../../tools/create_schema.js';
import { dropSchemaTool } from '../../tools/drop_schema.js';
import { createSequenceTool } from '../../tools/create_sequence.js';
import { setColumnDefaultTool } from '../../tools/set_column_default.js';
import {
    validateIdentifier,
    validateIdentifiers,
    quoteIdentifier,
    buildColumnDefinition,
} from '../../tools/ddl-utils.js';

// ------------------------------------------------------------------
// DDL Utils Tests
// ------------------------------------------------------------------
describe('ddl-utils', () => {
    test('validateIdentifier accepts valid identifiers', () => {
        expect(validateIdentifier('users')).toBeNull();
        expect(validateIdentifier('user_id')).toBeNull();
        expect(validateIdentifier('table_1')).toBeNull();
        expect(validateIdentifier('_private')).toBeNull();
    });

    test('validateIdentifier rejects empty names', () => {
        expect(validateIdentifier('')).toContain('cannot be empty');
    });

    test('validateIdentifier rejects reserved keywords', () => {
        expect(validateIdentifier('select')).toContain('reserved');
        expect(validateIdentifier('TABLE')).toContain('reserved');
        expect(validateIdentifier('order')).toContain('reserved');
    });

    test('validateIdentifier rejects invalid characters', () => {
        expect(validateIdentifier('user-id')).toContain('not a valid');
        expect(validateIdentifier('user.name')).toContain('not a valid');
        expect(validateIdentifier('user;drop')).toContain('not a valid');
    });

    test('validateIdentifier rejects too-long names', () => {
        const longName = 'a'.repeat(70);
        expect(validateIdentifier(longName)).toContain('exceeds');
    });

    test('validateIdentifiers throws on multiple failures', () => {
        expect(() =>
            validateIdentifiers([
                { name: 'select', context: 'Table' },
                { name: 'drop--it', context: 'Column' },
            ])
        ).toThrow('Identifier validation failed');
    });

    test('quoteIdentifier returns unquoted for standard identifiers', () => {
        expect(quoteIdentifier('users')).toBe('users');
        expect(quoteIdentifier('user_id')).toBe('user_id');
    });

    test('quoteIdentifier quotes reserved keywords', () => {
        expect(quoteIdentifier('order')).toBe('"order"');
        expect(quoteIdentifier('select')).toBe('"select"');
    });

    test('quoteIdentifier escapes internal quotes', () => {
        expect(quoteIdentifier('user"name')).toBe('"user""name"');
    });

    test('buildColumnDefinition generates correct SQL', () => {
        expect(buildColumnDefinition('id', 'uuid', [{ type: 'primary_key' }], false)).toBe(
            'id uuid NOT NULL PRIMARY KEY'
        );
        expect(buildColumnDefinition('email', 'text', [{ type: 'unique' }], false)).toBe(
            'email text NOT NULL UNIQUE'
        );
        expect(
            buildColumnDefinition('status', 'varchar', [{ type: 'default', value: "'active'" }], true)
        ).toBe("status varchar DEFAULT 'active'");
    });
});

// ------------------------------------------------------------------
// Tool privilege level tests
// ------------------------------------------------------------------
describe('DDL tool privilege levels', () => {
    test('create_table is privileged', () => {
        expect(createTableTool.privilegeLevel).toBe('privileged');
    });

    test('alter_table is privileged', () => {
        expect(alterTableTool.privilegeLevel).toBe('privileged');
    });

    test('drop_table is privileged', () => {
        expect(dropTableTool.privilegeLevel).toBe('privileged');
    });

    test('create_index is privileged', () => {
        expect(createIndexTool.privilegeLevel).toBe('privileged');
    });

    test('drop_index is privileged', () => {
        expect(dropIndexTool.privilegeLevel).toBe('privileged');
    });

    test('add_foreign_key is privileged', () => {
        expect(addForeignKeyTool.privilegeLevel).toBe('privileged');
    });

    test('drop_foreign_key is privileged', () => {
        expect(dropForeignKeyTool.privilegeLevel).toBe('privileged');
    });

    test('rename_table is privileged', () => {
        expect(renameTableTool.privilegeLevel).toBe('privileged');
    });

    test('create_schema is privileged', () => {
        expect(createSchemaTool.privilegeLevel).toBe('privileged');
    });

    test('drop_schema is privileged', () => {
        expect(dropSchemaTool.privilegeLevel).toBe('privileged');
    });

    test('create_sequence is privileged', () => {
        expect(createSequenceTool.privilegeLevel).toBe('privileged');
    });

    test('set_column_default is privileged', () => {
        expect(setColumnDefaultTool.privilegeLevel).toBe('privileged');
    });
});

// ------------------------------------------------------------------
// create_table SQL generation tests (dry-run)
// ------------------------------------------------------------------
describe('create_table tool', () => {
    test('generates basic CREATE TABLE SQL in dry-run mode', async () => {
        const result = await createTableTool.execute(
            {
                table: 'users',
                columns: [
                    { name: 'id', type: 'uuid', primary_key: true, nullable: false },
                    { name: 'email', type: 'text', unique: true, nullable: false },
                    { name: 'created_at', type: 'timestamptz', nullable: false, default_value: 'now()' },
                ],
                if_not_exists: true,
                dry_run: true,
            } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.sql).toContain('CREATE TABLE IF NOT EXISTS public.users');
        expect(result.sql).toContain('id uuid NOT NULL PRIMARY KEY');
        expect(result.sql).toContain('email text NOT NULL UNIQUE');
        expect(result.sql).toContain("created_at timestamptz NOT NULL DEFAULT now()");
        expect(result.message).toContain('DRY RUN');
    });

    test('auto-adds id and timestamps when enabled', async () => {
        const result = await createTableTool.execute(
            {
                table: 'posts',
                columns: [
                    { name: 'id', type: 'uuid', default_value: 'gen_random_uuid()', primary_key: true, nullable: false },
                    { name: 'title', type: 'text', nullable: true },
                    { name: 'created_at', type: 'timestamptz', default_value: 'now()', nullable: false },
                    { name: 'updated_at', type: 'timestamptz', default_value: 'now()', nullable: false },
                ],
                if_not_exists: true,
                dry_run: true,
            } as any,
            mockContext()
        );

        expect(result.sql).toContain('id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()');
        expect(result.sql).toContain('created_at timestamptz NOT NULL DEFAULT now()');
        expect(result.sql).toContain('updated_at timestamptz NOT NULL DEFAULT now()');
    });

    test('rejects invalid table names', async () => {
        await expect(
            createTableTool.execute(
                {
                    table: 'users;drop table users--',
                    columns: [{ name: 'id', type: 'uuid', nullable: true, primary_key: false, unique: false }],
                    dry_run: true,
                } as any,
                mockContext()
            )
        ).rejects.toThrow('not a valid PostgreSQL identifier');
    });

    test('rejects reserved keyword as table name', async () => {
        await expect(
            createTableTool.execute(
                {
                    table: 'select',
                    columns: [{ name: 'id', type: 'uuid', nullable: true, primary_key: false, unique: false }],
                    dry_run: true,
                } as any,
                mockContext()
            )
        ).rejects.toThrow('reserved');
    });

    test('warns when no primary key', async () => {
        const result = await createTableTool.execute(
            {
                table: 'logs',
                columns: [{ name: 'message', type: 'text', nullable: true, primary_key: false, unique: false }],
                add_id_column: false,
                dry_run: true,
            } as any,
            mockContext()
        );

        expect(result.warnings).toBeDefined();
        expect(result.warnings![0]).toContain('No primary key');
    });
});

// ------------------------------------------------------------------
// alter_table SQL generation tests (dry-run)
// ------------------------------------------------------------------
describe('alter_table tool', () => {
    test('generates add_column SQL in dry-run mode', async () => {
        const result = await alterTableTool.execute(
            {
                schema: 'public',
                table: 'users',
                operations: [{ operation: 'add_column', column: 'age', type: 'int', nullable: true }],
                dry_run: true,
            } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.sql_statements[0]).toContain('ALTER TABLE public.users');
        expect(result.sql_statements[0]).toContain('ADD COLUMN age int');
    });

    test('generates drop_column SQL with CASCADE', async () => {
        const result = await alterTableTool.execute(
            {
                table: 'users',
                operations: [{ operation: 'drop_column', column: 'temp_col', cascade: true, if_exists: false }],
                dry_run: true,
            } as any,
            mockContext()
        );

        expect(result.sql_statements[0]).toContain('DROP COLUMN temp_col CASCADE');
    });

    test('generates rename_column SQL', async () => {
        const result = await alterTableTool.execute(
            {
                schema: 'public',
                table: 'users',
                operations: [{ operation: 'rename_column', column: 'email', new_name: 'email_address' }],
                dry_run: true,
            } as any,
            mockContext()
        );

        expect(result.sql_statements[0]).toContain('RENAME COLUMN email TO email_address');
    });

    test('generates multiple operations', async () => {
        const result = await alterTableTool.execute(
            {
                schema: 'public',
                table: 'users',
                operations: [
                    { operation: 'add_column', column: 'bio', type: 'text', nullable: true },
                    { operation: 'set_not_null', column: 'email' },
                    { operation: 'set_default', column: 'status', default_value: "'active'" },
                ],
                dry_run: true,
            } as any,
            mockContext()
        );

        expect(result.sql_statements).toHaveLength(3);
        expect(result.sql_statements[0]).toContain('ADD COLUMN bio text');
        expect(result.sql_statements[1]).toContain('SET NOT NULL');
        expect(result.sql_statements[2]).toContain("SET DEFAULT 'active'");
    });

    test('rejects SQL injection in column names', async () => {
        await expect(
            alterTableTool.execute(
                {
                    schema: 'public',
                    table: 'users',
                    operations: [{ operation: 'drop_column', column: 'id; drop table users--', cascade: false, if_exists: false }],
                    dry_run: true,
                } as any,
                mockContext()
            )
        ).rejects.toThrow('not a valid PostgreSQL identifier');
    });
});

// ------------------------------------------------------------------
// drop_table SQL generation tests (dry-run)
// ------------------------------------------------------------------
describe('drop_table tool', () => {
    test('generates DROP TABLE IF EXISTS SQL', async () => {
        const result = await dropTableTool.execute(
            { schema: 'public', table: 'temp_table', if_exists: true, cascade: false, dry_run: true } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.sql).toBe('DROP TABLE IF EXISTS public.temp_table;');
        expect(result.message).toContain('DRY RUN');
    });

    test('generates DROP TABLE with CASCADE', async () => {
        const result = await dropTableTool.execute(
            { schema: 'public', table: 'old_table', if_exists: true, cascade: true, dry_run: true } as any,
            mockContext()
        );

        expect(result.sql).toContain('CASCADE');
        expect(result.warning).toContain('WARNING');
    });
});

// ------------------------------------------------------------------
// create_index SQL generation tests (dry-run)
// ------------------------------------------------------------------
describe('create_index tool', () => {
    test('generates basic CREATE INDEX SQL', async () => {
        const result = await createIndexTool.execute(
            {
                schema: 'public',
                table: 'users',
                index_name: 'idx_users_email',
                columns: ['email'],
                unique: false,
                concurrently: false,
                if_not_exists: true,
                method: 'btree',
                dry_run: true,
            } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.sql).toContain('CREATE INDEX IF NOT EXISTS idx_users_email');
        expect(result.sql).toContain('ON public.users USING btree (email)');
    });

    test('generates UNIQUE index', async () => {
        const result = await createIndexTool.execute(
            {
                schema: 'public',
                table: 'users',
                index_name: 'idx_users_email_unique',
                columns: ['email'],
                unique: true,
                concurrently: false,
                if_not_exists: true,
                method: 'btree',
                dry_run: true,
            } as any,
            mockContext()
        );

        expect(result.sql).toContain('CREATE UNIQUE INDEX');
    });

    test('generates CONCURRENTLY index', async () => {
        const result = await createIndexTool.execute(
            {
                schema: 'public',
                table: 'large_table',
                index_name: 'idx_large_table_status',
                columns: ['status'],
                unique: false,
                concurrently: true,
                if_not_exists: true,
                method: 'btree',
                dry_run: true,
            } as any,
            mockContext()
        );

        expect(result.sql).toContain('CONCURRENTLY');
        expect(result.warning).toContain('CONCURRENTLY');
    });

    test('supports multi-column index', async () => {
        const result = await createIndexTool.execute(
            {
                schema: 'public',
                table: 'users',
                index_name: 'idx_users_name_email',
                columns: ['first_name', 'email'],
                unique: false,
                concurrently: false,
                if_not_exists: true,
                method: 'btree',
                dry_run: true,
            } as any,
            mockContext()
        );

        expect(result.sql).toContain('(first_name, email)');
    });

    test('supports gin method for jsonb', async () => {
        const result = await createIndexTool.execute(
            {
                schema: 'public',
                table: 'documents',
                index_name: 'idx_docs_metadata',
                columns: ['metadata'],
                unique: false,
                concurrently: false,
                if_not_exists: true,
                method: 'gin',
                dry_run: true,
            } as any,
            mockContext()
        );

        expect(result.sql).toContain('USING gin');
    });
});

// ------------------------------------------------------------------
// drop_index SQL generation tests (dry-run)
// ------------------------------------------------------------------
describe('drop_index tool', () => {
    test('generates DROP INDEX IF EXISTS SQL', async () => {
        const result = await dropIndexTool.execute(
            { schema: 'public', index_name: 'idx_users_email', if_exists: true, concurrently: false, cascade: false, dry_run: true } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.sql).toBe('DROP INDEX IF EXISTS public.idx_users_email;');
    });

    test('generates DROP INDEX CONCURRENTLY', async () => {
        const result = await dropIndexTool.execute(
            { schema: 'public', index_name: 'idx_old', if_exists: true, concurrently: true, cascade: false, dry_run: true } as any,
            mockContext()
        );

        expect(result.sql).toContain('CONCURRENTLY');
    });
});

// ------------------------------------------------------------------
// add_foreign_key SQL generation tests (dry-run)
// ------------------------------------------------------------------
describe('add_foreign_key tool', () => {
    test('generates basic FOREIGN KEY SQL', async () => {
        const result = await addForeignKeyTool.execute(
            {
                schema: 'public',
                table: 'posts',
                columns: ['user_id'],
                referenced_schema: 'public',
                referenced_table: 'users',
                referenced_columns: ['id'],
                deferrable: false,
                initially_deferred: false,
                dry_run: true,
            } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.sql).toContain('ADD CONSTRAINT fk_posts_user_id_users');
        expect(result.sql).toContain('FOREIGN KEY (user_id) REFERENCES public.users (id)');
    });

    test('generates FOREIGN KEY with ON DELETE CASCADE', async () => {
        const result = await addForeignKeyTool.execute(
            {
                schema: 'public',
                table: 'comments',
                columns: ['post_id'],
                referenced_schema: 'public',
                referenced_table: 'posts',
                referenced_columns: ['id'],
                on_delete: 'CASCADE',
                deferrable: false,
                initially_deferred: false,
                dry_run: true,
            } as any,
            mockContext()
        );

        expect(result.sql).toContain('ON DELETE CASCADE');
    });

    test('generates DEFERRABLE INITIALLY DEFERRED', async () => {
        const result = await addForeignKeyTool.execute(
            {
                schema: 'public',
                table: 'orders',
                columns: ['customer_id'],
                referenced_schema: 'public',
                referenced_table: 'customers',
                referenced_columns: ['id'],
                deferrable: true,
                initially_deferred: true,
                dry_run: true,
            } as any,
            mockContext()
        );

        expect(result.sql).toContain('DEFERRABLE INITIALLY DEFERRED');
    });

    test('uses custom constraint name', async () => {
        const result = await addForeignKeyTool.execute(
            {
                schema: 'public',
                table: 'posts',
                columns: ['user_id'],
                referenced_schema: 'public',
                referenced_table: 'users',
                referenced_columns: ['id'],
                constraint_name: 'custom_fk_name',
                deferrable: false,
                initially_deferred: false,
                dry_run: true,
            } as any,
            mockContext()
        );

        expect(result.constraint_name).toBe('custom_fk_name');
        expect(result.sql).toContain('ADD CONSTRAINT custom_fk_name');
    });

    test('rejects mismatched column counts', async () => {
        await expect(
            addForeignKeyTool.execute(
                {
                    schema: 'public',
                    table: 'posts',
                    columns: ['user_id', 'tenant_id'],
                    referenced_schema: 'public',
                    referenced_table: 'users',
                    referenced_columns: ['id'],
                    deferrable: false,
                    initially_deferred: false,
                    dry_run: true,
                } as any,
                mockContext()
            )
        ).rejects.toThrow('column counts must match');
    });
});

// ------------------------------------------------------------------
// drop_foreign_key SQL generation tests (dry-run)
// ------------------------------------------------------------------
describe('drop_foreign_key tool', () => {
    test('generates DROP CONSTRAINT SQL', async () => {
        const result = await dropForeignKeyTool.execute(
            {
                schema: 'public',
                table: 'posts',
                constraint_name: 'fk_posts_user_id_users',
                cascade: false,
                dry_run: true,
            } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.sql).toContain('ALTER TABLE public.posts');
        expect(result.sql).toContain('DROP CONSTRAINT fk_posts_user_id_users');
    });
});

// ------------------------------------------------------------------
// rename_table tests
// ------------------------------------------------------------------
describe('rename_table tool', () => {
    test('generates RENAME TABLE SQL', async () => {
        const result = await renameTableTool.execute(
            { schema: 'public', table: 'old_users', new_name: 'users', dry_run: true } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.sql).toContain('ALTER TABLE public.old_users RENAME TO users');
        expect(result.message).toContain('DRY RUN');
    });

    test('rejects invalid new name', async () => {
        await expect(
            renameTableTool.execute(
                { schema: 'public', table: 'users', new_name: 'select', dry_run: true } as any,
                mockContext()
            )
        ).rejects.toThrow('reserved');
    });
});

// ------------------------------------------------------------------
// create_schema tests
// ------------------------------------------------------------------
describe('create_schema tool', () => {
    test('generates CREATE SCHEMA SQL', async () => {
        const result = await createSchemaTool.execute(
            { schema: 'analytics', if_not_exists: true, dry_run: true } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.sql).toBe('CREATE SCHEMA IF NOT EXISTS analytics;');
    });

    test('rejects reserved schema name', async () => {
        await expect(
            createSchemaTool.execute(
                { schema: 'order', if_not_exists: true, dry_run: true } as any,
                mockContext()
            )
        ).rejects.toThrow('reserved');
    });
});

// ------------------------------------------------------------------
// drop_schema tests
// ------------------------------------------------------------------
describe('drop_schema tool', () => {
    test('generates DROP SCHEMA IF EXISTS SQL', async () => {
        const result = await dropSchemaTool.execute(
            { schema: 'temp_schema', if_exists: true, cascade: false, dry_run: true } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.sql).toBe('DROP SCHEMA IF EXISTS temp_schema;');
    });

    test('generates DROP SCHEMA CASCADE with warning', async () => {
        const result = await dropSchemaTool.execute(
            { schema: 'old_schema', if_exists: true, cascade: true, dry_run: true } as any,
            mockContext()
        );

        expect(result.sql).toContain('CASCADE');
        expect(result.warning).toContain('WARNING');
    });
});

// ------------------------------------------------------------------
// create_sequence tests
// ------------------------------------------------------------------
describe('create_sequence tool', () => {
    test('generates basic CREATE SEQUENCE SQL', async () => {
        const result = await createSequenceTool.execute(
            { schema: 'public', name: 'users_id_seq', if_not_exists: true, dry_run: true } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.sql).toContain('CREATE SEQUENCE IF NOT EXISTS public.users_id_seq');
    });

    test('generates sequence with all options', async () => {
        const result = await createSequenceTool.execute(
            {
                schema: 'public',
                name: 'order_seq',
                start: 1000,
                increment: 5,
                minvalue: 1,
                maxvalue: 999999,
                cycle: true,
                cache: 10,
                dry_run: true,
            } as any,
            mockContext()
        );

        expect(result.sql).toContain('START 1000');
        expect(result.sql).toContain('INCREMENT 5');
        expect(result.sql).toContain('MINVALUE 1');
        expect(result.sql).toContain('MAXVALUE 999999');
        expect(result.sql).toContain('CYCLE');
        expect(result.sql).toContain('CACHE 10');
    });

    test('generates sequence with OWNED BY', async () => {
        const result = await createSequenceTool.execute(
            {
                schema: 'public',
                name: 'users_id_seq',
                owned_by: 'users.id',
                dry_run: true,
            } as any,
            mockContext()
        );

        expect(result.sql).toContain('OWNED BY public.users.id');
    });

    test('rejects invalid owned_by format', async () => {
        await expect(
            createSequenceTool.execute(
                { schema: 'public', name: 'seq', owned_by: 'invalid', dry_run: true } as any,
                mockContext()
            )
        ).rejects.toThrow('owned_by must be in format');
    });
});

// ------------------------------------------------------------------
// set_column_default tests
// ------------------------------------------------------------------
describe('set_column_default tool', () => {
    test('generates SET DEFAULT SQL', async () => {
        const result = await setColumnDefaultTool.execute(
            { schema: 'public', table: 'users', column: 'status', default_value: "'active'", dry_run: true } as any,
            mockContext()
        );

        expect(result.success).toBe(true);
        expect(result.sql).toContain('SET DEFAULT');
        expect(result.sql).toContain("'active'");
    });

    test('generates DROP DEFAULT SQL when default_value omitted', async () => {
        const result = await setColumnDefaultTool.execute(
            { schema: 'public', table: 'users', column: 'status', dry_run: true } as any,
            mockContext()
        );

        expect(result.sql).toContain('DROP DEFAULT');
        expect(result.sql).not.toContain('SET DEFAULT');
    });
});

// ------------------------------------------------------------------
// Helper
// ------------------------------------------------------------------
function mockContext(): any {
    return {
        selfhostedClient: {} as any,
        workspacePath: '/tmp',
        user: undefined,
        log: () => {},
    };
}
