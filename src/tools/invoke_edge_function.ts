/**
 * invoke_edge_function — Calls an Edge Function with a JSON payload.
 *
 * Uses Supabase JS client functions.invoke().
 * Regular tool.
 */

import { z } from 'zod';
import type { ToolContext, ToolPrivilegeLevel } from './types.js';

const InvokeEdgeFunctionInputSchema = z.object({
    function_name: z.string().describe('Function slug to invoke'),
    payload: z.record(z.string(), z.any()).optional().describe('JSON payload to send'),
    headers: z.record(z.string(), z.string()).optional().describe('Custom HTTP headers'),
    method: z.enum(['POST', 'GET']).optional().default('POST'),
});

type InvokeEdgeFunctionInput = z.infer<typeof InvokeEdgeFunctionInputSchema>;

const InvokeEdgeFunctionOutputSchema = z.object({
    success: z.boolean(),
    data: z.any().nullable(),
    status: z.number().optional(),
    message: z.string(),
});

const mcpInputSchema = {
    type: 'object',
    properties: {
        function_name: { type: 'string' },
        payload: { type: 'object' },
        headers: { type: 'object' },
        method: { type: 'string', enum: ['POST', 'GET'], default: 'POST' },
    },
    required: ['function_name'],
};

export const invokeEdgeFunctionTool = {
    name: 'invoke_edge_function',
    description: 'Invokes a deployed Edge Function with a JSON payload. Returns the function response.',
    privilegeLevel: 'regular' as ToolPrivilegeLevel,
    inputSchema: InvokeEdgeFunctionInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: InvokeEdgeFunctionOutputSchema,

    execute: async (input: InvokeEdgeFunctionInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { function_name, payload, headers, method } = input;

        const sbClient = client.getServiceRoleClient() || client.supabase;
        if (!sbClient) {
            throw new Error('Supabase client is not available.');
        }

        context.log(`Invoking edge function "${function_name}"...`, 'info');

        const options: Record<string, unknown> = { method };
        if (payload) options.body = payload;
        if (headers) options.headers = headers;

        const { data, error } = await sbClient.functions.invoke(function_name, options);

        if (error) {
            throw new Error(`Function invocation failed: ${error.message}`);
        }

        return {
            success: true,
            data: data ?? null,
            message: `Function "${function_name}" invoked successfully.`,
        };
    },
};
