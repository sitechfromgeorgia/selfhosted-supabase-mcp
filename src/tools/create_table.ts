/**
 * create_table - Creates a new database table with columns and constraints.
 *
 * Safety Features:
 * - Validates all identifiers (table name, column names, schema name)
 * - Checks for reserved PostgreSQL keywords
 * - Warns if no primary key is defined
 * - Supports dry-run mode (preview SQL without executing)
 * - Validates data types against known PostgreSQL types
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';
import { executeSqlWithFallback } from './utils.js';
import {
    validateIdentifiers,
    quoteIdentifier,
    DataTypeSchema,
    buildColumnDefinition,
} from './ddl-utils.js';

// Input schema
const ColumnDefinitionSchema = z.object({
    name: z.string().describe('Column name (must be valid PostgreSQL identifier)'),
    type: DataTypeSchema.describe('PostgreSQL data type (e.g., uuid, text, integer, timestamp)'),
    nullable: z.boolean().optional().default(true).describe('Whether the column allows NULL values'),
    default_value: z.string().optional().describe('Default value expression (e.g., gen_random_uuid(), now(), 0)'),
    primary_key: z.boolean().optional().default(false).describe('Whether this column is the primary key'),
    unique: z.boolean().optional().default(false).describe('Whether this column has a UNIQUE constraint'),
    references: z.object({
        table: z.string().describe('Referenced table name'),
        column: z.string().describe('Referenced column name'),
    }).optional().describe('Foreign key reference'),
    check: z.string().optional().describe('CHECK constraint expression (e.g., "length(name) > 0")'),
});

const CreateTableInputSchema = z.object({
    schema: z.string().optional().default('public').describe('Schema name (default: public)'),
    table: z.string().describe('Table name (must be valid PostgreSQL identifier)'),
    columns: z.array(ColumnDefinitionSchema).min(1).describe('Array of column definitions'),
    if_not_exists: z.boolean().optional().default(true).describe('Add IF NOT EXISTS guard'),
    dry_run: z.boolean().optional().default(false).describe('Preview SQL without executing'),
});

type CreateTableInput = z.infer<typeof CreateTableInputSchema>;

// Output schema
const CreateTableOutputSchema = z.object({
    success: z.boolean(),
    sql: z.string(),
    warnings: z.array(z.string()).optional(),
    message: z.string(),
});

// Static JSON Schema for MCP capabilities
const mcpInputSchema = {
    type: 'object',
    properties: {
        schema: { type: 'string', default: 'public', description: 'Schema name' },
        table: { type: 'string', description: 'Table name' },
        columns: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Column name' },
                    type: { type: 'string', description: 'PostgreSQL data type' },
                    nullable: { type: 'boolean', default: true },
                    default_value: { type: 'string' },
                    primary_key: { type: 'boolean', default: false },
                    unique: { type: 'boolean', default: false },
                    references: {
                        type: 'object',
                        properties: {
                            table: { type: 'string' },
                            column: { type: 'string' },
                        },
                    },
                    check: { type: 'string' },
                },
                required: ['name', 'type'],
            },
        },
        if_not_exists: { type: 'boolean', default: true },
        dry_run: { type: 'boolean', default: false },
    },
    required: ['table', 'columns'],
};

export const createTableTool = {
    name: 'create_table',
    description: 'Creates a new database table with columns and constraints. Validates identifiers, warns about missing primary keys, and supports dry-run mode.',
    privilegeLevel: 'privileged' as ToolPrivilegeLevel,
    inputSchema: CreateTableInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: CreateTableOutputSchema,

    execute: async (input: CreateTableInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { schema, table, columns, if_not_exists, dry_run } = input;

        // SECURITY: Validate all identifiers
        const identifiersToValidate = [
            { name: schema, context: 'Schema name' },
            { name: table, context: 'Table name' },
            ...columns.map((col) => ({ name: col.name, context: `Column name` })),
            ...columns
                .filter((col) => col.references)
                .flatMap((col) => [
                    { name: col.references!.table, context: 'Referenced table' },
                    { name: col.references!.column, context: 'Referenced column' },
                ]),
        ];
        validateIdentifiers(identifiersToValidate);

        // Check for primary key
        const hasPrimaryKey = columns.some((col) => col.primary_key);
        const warnings: string[] = [];

        if (!hasPrimaryKey) {
            warnings.push(
                '⚠️ WARNING: No primary key defined. It is strongly recommended to add a primary key for row identification, foreign key references, and ORM compatibility.'
            );
        }

        // Build column definitions
        const columnDefs = columns.map((col) => {
            const constraints: Array<{ type: 'primary_key' | 'unique' | 'default' | 'check' | 'references'; value?: string; referenceTable?: string; referenceColumn?: string }> = [];

            if (col.primary_key) constraints.push({ type: 'primary_key' });
            if (col.unique) constraints.push({ type: 'unique' });
            if (col.default_value) constraints.push({ type: 'default', value: col.default_value });
            if (col.check) constraints.push({ type: 'check', value: col.check });
            if (col.references) {
                constraints.push({
                    type: 'references',
                    referenceTable: col.references.table,
                    referenceColumn: col.references.column,
                });
            }

            return buildColumnDefinition(col.name, col.type, constraints, col.nullable);
        });

        // Build CREATE TABLE SQL
        const ifNotExistsClause = if_not_exists ? 'IF NOT EXISTS ' : '';
        const tableRef = `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;

        const sql = `CREATE TABLE ${ifNotExistsClause}${tableRef} (
    ${columnDefs.join(',\n    ')}
);`;

        // Dry run: return SQL without executing
        if (dry_run) {
            return {
                success: true,
                sql,
                warnings: warnings.length > 0 ? warnings : undefined,
                message: `DRY RUN: SQL prepared but not executed.${warnings.length > 0 ? ' Warnings found.' : ''}`,
            };
        }

        // Execute SQL
        context.log(`Creating table ${schema}.${table}...`, 'info');

        const result = await executeSqlWithFallback(client, sql, false);

        if ('error' in result) {
            throw new Error(`Failed to create table: ${result.error.message}`);
        }

        return {
            success: true,
            sql,
            warnings: warnings.length > 0 ? warnings : undefined,
            message: `Table ${schema}.${table} created successfully.${warnings.length > 0 ? ' See warnings.' : ''}`,
        };
    },
};
