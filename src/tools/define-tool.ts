/**
 * Helper to define MCP tools with automatic JSON Schema generation from Zod schemas.
 *
 * This eliminates the need to manually maintain both a Zod schema and a static
 * JSON Schema for each tool. Uses Zod v4's built-in `toJSONSchema`.
 */

import { z, toJSONSchema } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';

// Base structure for our tool objects
export interface AppTool<TInput = unknown, TOutput = unknown> {
    name: string;
    description: string;
    inputSchema: z.ZodSchema<TInput>;
    mcpInputSchema: object;
    outputSchema: z.ZodSchema<TOutput>;
    privilegeLevel?: ToolPrivilegeLevel;
    execute: (input: TInput, context: ToolContext) => Promise<TOutput>;
}

/**
 * Defines an MCP tool with automatic JSON Schema generation.
 *
 * @example
 * ```ts
 * const myTool = defineTool({
 *   name: 'my_tool',
 *   description: 'Does something useful',
 *   privilegeLevel: 'regular',
 *   inputSchema: z.object({ id: z.string().uuid() }),
 *   outputSchema: z.object({ success: z.boolean() }),
 *   execute: async (input, context) => {
 *     return { success: true };
 *   },
 * });
 * ```
 */
export function defineTool<TInput, TOutput>(config: {
    name: string;
    description: string;
    privilegeLevel?: ToolPrivilegeLevel;
    inputSchema: z.ZodSchema<TInput>;
    outputSchema: z.ZodSchema<TOutput>;
    execute: (input: TInput, context: ToolContext) => Promise<TOutput>;
}): AppTool<TInput, TOutput> {
    // Generate JSON Schema from Zod schema using Zod v4 built-in support
    const mcpInputSchema = toJSONSchema(config.inputSchema, {
        target: 'draft-2020-12',
        unrepresentable: 'any',
    });

    return {
        name: config.name,
        description: config.description,
        privilegeLevel: config.privilegeLevel,
        inputSchema: config.inputSchema,
        mcpInputSchema,
        outputSchema: config.outputSchema,
        execute: config.execute,
    };
}
