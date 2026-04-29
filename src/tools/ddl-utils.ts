/**
 * Shared utilities for DDL (Data Definition Language) tools.
 *
 * Provides:
 * - Identifier validation (PostgreSQL rules)
 * - Reserved keyword checking
 * - SQL injection guards for identifiers
 * - Dry-run SQL generation helpers
 */

import { z } from 'zod';

// PostgreSQL reserved keywords (subset of most common/dangerous)
// Full list: https://www.postgresql.org/docs/current/sql-keywords-appendix.html
const RESERVED_KEYWORDS = new Set([
    'all', 'analyse', 'analyze', 'and', 'any', 'array', 'as', 'asc',
    'asymmetric', 'authorization', 'binary', 'both', 'case', 'cast',
    'check', 'collate', 'collation', 'column', 'concurrently', 'constraint',
    'create', 'cross', 'current_catalog', 'current_date', 'current_role',
    'current_schema', 'current_time', 'current_timestamp', 'current_user',
    'default', 'deferrable', 'desc', 'distinct', 'do', 'else', 'end',
    'except', 'false', 'fetch', 'for', 'foreign', 'freeze', 'from', 'full',
    'grant', 'group', 'having', 'ilike', 'in', 'initially', 'inner',
    'intersect', 'into', 'is', 'isnull', 'join', 'lateral', 'leading',
    'left', 'like', 'limit', 'localtime', 'localtimestamp', 'natural',
    'not', 'notnull', 'null', 'offset', 'on', 'only', 'or', 'order',
    'outer', 'overlaps', 'placing', 'primary', 'references', 'returning',
    'right', 'select', 'session_user', 'similar', 'some', 'symmetric',
    'table', 'tablesample', 'then', 'to', 'trailing', 'true', 'union',
    'unique', 'user', 'using', 'variadic', 'verbose', 'when', 'where',
    'window', 'with',
]);

// Valid PostgreSQL identifier pattern
// Must start with letter or underscore, followed by letters, digits, underscores, $
const IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_$]*$/;

// Max identifier length in PostgreSQL (63 bytes)
const MAX_IDENTIFIER_LENGTH = 63;

/**
 * Validates a PostgreSQL identifier.
 * Returns null if valid, error message if invalid.
 */
export function validateIdentifier(name: string, context: string = 'Identifier'): string | null {
    if (!name || name.length === 0) {
        return `${context} cannot be empty.`;
    }

    if (name.length > MAX_IDENTIFIER_LENGTH) {
        return `${context} "${name}" exceeds PostgreSQL maximum length of ${MAX_IDENTIFIER_LENGTH} characters.`;
    }

    if (!IDENTIFIER_REGEX.test(name)) {
        return `${context} "${name}" is not a valid PostgreSQL identifier. Must start with a letter or underscore and contain only letters, digits, underscores, and $.`;
    }

    if (RESERVED_KEYWORDS.has(name.toLowerCase())) {
        return `${context} "${name}" is a reserved PostgreSQL keyword. Please choose a different name.`;
    }

    return null;
}

/**
 * Validates multiple identifiers at once.
 * Throws an error with all validation failures.
 */
export function validateIdentifiers(identifiers: Array<{ name: string; context: string }>): void {
    const errors: string[] = [];

    for (const { name, context } of identifiers) {
        const error = validateIdentifier(name, context);
        if (error) errors.push(error);
    }

    if (errors.length > 0) {
        throw new Error(`Identifier validation failed:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
    }
}

/**
 * Safely quotes an identifier for use in SQL.
 * Uses double quotes to handle special cases, but prefers unquoted for standard identifiers.
 */
export function quoteIdentifier(name: string): string {
    // If it's a standard identifier, no need to quote
    if (IDENTIFIER_REGEX.test(name) && !RESERVED_KEYWORDS.has(name.toLowerCase())) {
        return name;
    }
    // Otherwise, quote it (escape internal double quotes by doubling them)
    return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Zod schema for a valid PostgreSQL identifier.
 */
export const IdentifierSchema = z
    .string()
    .min(1, 'Identifier cannot be empty')
    .max(MAX_IDENTIFIER_LENGTH, `Identifier exceeds ${MAX_IDENTIFIER_LENGTH} characters`)
    .regex(IDENTIFIER_REGEX, 'Invalid PostgreSQL identifier')
    .refine(
        (name: string) => !RESERVED_KEYWORDS.has(name.toLowerCase()),
        { message: 'Identifier is a reserved PostgreSQL keyword' }
    );

/**
 * Zod schema for a PostgreSQL data type.
 * Supports common types with optional modifiers.
 */
export const DataTypeSchema = z
    .string()
    .min(1)
    .refine(
        (type: string) => {
            // Common PostgreSQL types
            const validTypes = [
                'bigint', 'bigserial', 'bit', 'boolean', 'box', 'bytea', 'char', 'character',
                'cidr', 'circle', 'date', 'decimal', 'double precision', 'float4', 'float8',
                'inet', 'int', 'int2', 'int4', 'int8', 'integer', 'interval', 'json', 'jsonb',
                'line', 'lseg', 'macaddr', 'macaddr8', 'money', 'numeric', 'path', 'pg_lsn',
                'pg_snapshot', 'point', 'polygon', 'real', 'serial', 'serial2', 'serial4',
                'serial8', 'smallint', 'smallserial', 'text', 'time', 'timestamp', 'timestamptz',
                'timetz', 'tsquery', 'tsvector', 'txid_snapshot', 'uuid', 'varbit', 'varchar',
                'xml', 'vector', // pgvector
            ];
            const baseType = type.toLowerCase().split('(')[0].trim();
            return validTypes.includes(baseType);
        },
        { message: 'Unsupported PostgreSQL data type' }
    );

/**
 * Generates a dry-run preview of SQL without executing it.
 */
export function generateDryRunPreview(sql: string): string {
    return `-- DRY RUN (not executed)\n${sql}`;
}

/**
 * Common column constraint types for DDL tools.
 */
export const ColumnConstraintSchema = z.object({
    type: z.enum(['primary_key', 'unique', 'not_null', 'default', 'check', 'foreign_key', 'references']),
    value: z.string().optional(), // for DEFAULT, CHECK expression
    referenceTable: z.string().optional(), // for FOREIGN KEY
    referenceColumn: z.string().optional(), // for FOREIGN KEY
});

/**
 * Builds a column definition SQL fragment.
 */
export function buildColumnDefinition(
    name: string,
    dataType: string,
    constraints: z.infer<typeof ColumnConstraintSchema>[] = [],
    nullable: boolean = true
): string {
    const parts: string[] = [quoteIdentifier(name), dataType];

    if (!nullable) {
        parts.push('NOT NULL');
    }

    for (const constraint of constraints) {
        switch (constraint.type) {
            case 'primary_key':
                parts.push('PRIMARY KEY');
                break;
            case 'unique':
                parts.push('UNIQUE');
                break;
            case 'default':
                if (constraint.value) {
                    parts.push(`DEFAULT ${constraint.value}`);
                }
                break;
            case 'check':
                if (constraint.value) {
                    parts.push(`CHECK (${constraint.value})`);
                }
                break;
            case 'references':
                if (constraint.referenceTable && constraint.referenceColumn) {
                    parts.push(`REFERENCES ${quoteIdentifier(constraint.referenceTable)} (${quoteIdentifier(constraint.referenceColumn)})`);
                }
                break;
        }
    }

    return parts.join(' ');
}
