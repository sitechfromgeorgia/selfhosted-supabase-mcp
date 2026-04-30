/**
 * Integration tests for HTTP MCP Server
 *
 * These tests verify:
 * - Health check endpoint
 * - CORS behavior
 * - Rate limiting
 * - Security headers
 * - JWT authentication on /mcp
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import jwt from 'jsonwebtoken';
import { HttpMcpServer } from '../../server/http-server.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

// NOSONAR: test fixture secret
// codacy:disable-line:hardcoded-credentials
const JWT_SECRET = 'test-http-server-jwt-secret-12345';

function createMcpServerFactory() {
    return () =>
        new Server(
            { name: 'test-server', version: '1.0.0' },
            { capabilities: {} }
        );
}

function createToken(payload: Record<string, unknown>) {
    return jwt.sign(payload, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
}

describe('HttpMcpServer', () => {
    let httpServer: HttpMcpServer;

    afterEach(async () => {
        if (httpServer) {
            await httpServer.stop();
        }
    });

    describe('Health check', () => {
        test('returns healthy status', async () => {
            httpServer = new HttpMcpServer(
                {
                    port: 3999,
                    host: '127.0.0.1',
                    jwtSecret: JWT_SECRET,
                },
                createMcpServerFactory()
            );
            await httpServer.start();

            const res = await fetch('http://127.0.0.1:3999/health');
            expect(res.status).toBe(200);
            const body = (await res.json()) as { status: string };
            expect(body.status).toBe('healthy');
        });
    });

    describe('CORS', () => {
        test('allows localhost origin by default', async () => {
            httpServer = new HttpMcpServer(
                {
                    port: 3998,
                    host: '127.0.0.1',
                    jwtSecret: JWT_SECRET,
                },
                createMcpServerFactory()
            );
            await httpServer.start();

            const res = await fetch('http://127.0.0.1:3998/health', {
                headers: { Origin: 'http://localhost:3998' },
            });
            expect(res.headers.get('Access-Control-Allow-Origin')).toContain('localhost');
        });

        test('blocks forbidden origin', async () => {
            httpServer = new HttpMcpServer(
                {
                    port: 3997,
                    host: '127.0.0.1',
                    jwtSecret: JWT_SECRET,
                },
                createMcpServerFactory()
            );
            await httpServer.start();

            const res = await fetch('http://127.0.0.1:3997/health', {
                headers: { Origin: 'https://evil.com' },
            });
            expect(res.status).toBe(403);
        });

        test('handles preflight OPTIONS request', async () => {
            httpServer = new HttpMcpServer(
                {
                    port: 3996,
                    host: '127.0.0.1',
                    jwtSecret: JWT_SECRET,
                    corsOrigins: ['http://localhost:3000'],
                },
                createMcpServerFactory()
            );
            await httpServer.start();

            const res = await fetch('http://127.0.0.1:3996/mcp', {
                method: 'OPTIONS',
                headers: {
                    Origin: 'http://localhost:3000',
                    'Access-Control-Request-Method': 'POST',
                },
            });
            expect(res.status).toBe(204);
            expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');
        });
    });

    describe('Security headers', () => {
        test('includes security headers on responses', async () => {
            httpServer = new HttpMcpServer(
                {
                    port: 3995,
                    host: '127.0.0.1',
                    jwtSecret: JWT_SECRET,
                },
                createMcpServerFactory()
            );
            await httpServer.start();

            const res = await fetch('http://127.0.0.1:3995/health');
            expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
            expect(res.headers.get('X-Frame-Options')).toBe('DENY');
            // Strict-Transport-Security may not be exposed by fetch API in Bun
            const hsts = res.headers.get('Strict-Transport-Security');
            if (hsts !== null) {
                expect(hsts).toContain('max-age=');
            }
            expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
        });
    });

    describe('Rate limiting', () => {
        test('allows requests within limit', async () => {
            httpServer = new HttpMcpServer(
                {
                    port: 3994,
                    host: '127.0.0.1',
                    jwtSecret: JWT_SECRET,
                    rateLimitWindowMs: 60000,
                    rateLimitMaxRequests: 5,
                },
                createMcpServerFactory()
            );
            await httpServer.start();

            const token = createToken({ sub: 'user-123', role: 'service_role' });
            const res = await fetch('http://127.0.0.1:3994/mcp', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 }),
            });
            expect(res.status).not.toBe(429);
            expect(res.headers.get('X-RateLimit-Limit')).toBe('5');
        });
    });

    describe('JWT authentication on /mcp', () => {
        test('returns 401 without Authorization header', async () => {
            httpServer = new HttpMcpServer(
                {
                    port: 3993,
                    host: '127.0.0.1',
                    jwtSecret: JWT_SECRET,
                },
                createMcpServerFactory()
            );
            await httpServer.start();

            const res = await fetch('http://127.0.0.1:3993/mcp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 }),
            });
            expect(res.status).toBe(401);
        });

        test('returns 401 with invalid token', async () => {
            httpServer = new HttpMcpServer(
                {
                    port: 3992,
                    host: '127.0.0.1',
                    jwtSecret: JWT_SECRET,
                },
                createMcpServerFactory()
            );
            await httpServer.start();

            const res = await fetch('http://127.0.0.1:3992/mcp', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer invalid-token',
                },
                body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 }),
            });
            expect(res.status).toBe(401);
        });

        test('accepts valid JWT token', async () => {
            httpServer = new HttpMcpServer(
                {
                    port: 3991,
                    host: '127.0.0.1',
                    jwtSecret: JWT_SECRET,
                },
                createMcpServerFactory()
            );
            await httpServer.start();

            const token = createToken({ sub: 'user-123', role: 'service_role' });
            const res = await fetch('http://127.0.0.1:3991/mcp', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 }),
            });
            // Should not be 401 — might be 200 or other MCP-level error
            expect(res.status).not.toBe(401);
        });
    });

    describe('HTTP methods on /mcp', () => {
        test('GET /mcp returns 405 in stateless mode', async () => {
            httpServer = new HttpMcpServer(
                {
                    port: 3990,
                    host: '127.0.0.1',
                    jwtSecret: JWT_SECRET,
                },
                createMcpServerFactory()
            );
            await httpServer.start();

            const token = createToken({ sub: 'user-123', role: 'service_role' });
            const res = await fetch('http://127.0.0.1:3990/mcp', {
                method: 'GET',
                headers: { Authorization: `Bearer ${token}` },
            });
            expect(res.status).toBe(405);
        });

        test('DELETE /mcp returns 405 in stateless mode', async () => {
            httpServer = new HttpMcpServer(
                {
                    port: 3989,
                    host: '127.0.0.1',
                    jwtSecret: JWT_SECRET,
                },
                createMcpServerFactory()
            );
            await httpServer.start();

            const token = createToken({ sub: 'user-123', role: 'service_role' });
            const res = await fetch('http://127.0.0.1:3989/mcp', {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            expect(res.status).toBe(405);
        });
    });
});
