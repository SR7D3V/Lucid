import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { exec, one } from '@/server/db';
import { clientIp, readJson, route } from '@/server/http';
import { safeNextPath } from '@/lib/redirect';
import { runSqlConsole } from '@/server/services/admin';
import { createCustomer, resetData } from './fixtures';

const request = (headers: Record<string, string>, init: RequestInit = {}) =>
  new Request('http://shop.test/api/x', { method: 'POST', ...init, headers: { host: 'shop.test', ...headers } });

describe('open redirect protection', () => {
  it.each([
    '//evil.com',
    '/\\evil.com',
    '/\t/evil.com',
    '/\n/evil.com',
    'https://evil.com',
    'javascript:alert(1)',
    '/%09/evil.com',
    '',
  ])('rejects %j', (value) => {
    const result = safeNextPath(decodeURIComponent(value));
    expect(result).toBe('/account');
  });

  it('keeps legitimate paths, including query and hash', () => {
    expect(safeNextPath('/cart')).toBe('/cart');
    expect(safeNextPath('/store?category=men&sub=shirts#top')).toBe('/store?category=men&sub=shirts#top');
  });
});

describe('client IP', () => {
  it('uses the entry added by the trusted proxy, not client-supplied ones', () => {
    // Client forged "1.1.1.1"; our proxy appended the real address.
    expect(clientIp(request({ 'x-forwarded-for': '1.1.1.1, 203.0.113.7' }))).toBe('203.0.113.7');
    expect(clientIp(request({ 'x-forwarded-for': '203.0.113.7' }))).toBe('203.0.113.7');
  });
});

describe('request handling', () => {
  const echo = route(async (req: Request) => Response.json(await readJson(req, z.object({ a: z.number() }))));

  it('blocks cross-site and opaque origins', async () => {
    expect((await echo(request({ origin: 'https://evil.com' }, { body: '{"a":1}' }), {})).status).toBe(403);
    expect((await echo(request({ origin: 'null' }, { body: '{"a":1}' }), {})).status).toBe(403);
    expect((await echo(request({ origin: 'http://shop.test' }, { body: '{"a":1}' }), {})).status).toBe(200);
  });

  it('rejects oversized and malformed bodies', async () => {
    expect((await echo(request({}, { body: JSON.stringify({ a: 1, pad: 'x'.repeat(20_000) }) }), {})).status).toBe(413);
    expect((await echo(request({}, { body: '{not json' }), {})).status).toBe(400);
    expect((await echo(request({}, { body: '{"a":"1"}' }), {})).status).toBe(400);
  });

  it('never leaks internals on unexpected errors', async () => {
    const boom = route(async () => {
      throw new Error('connection string postgres://secret');
    });
    const response = await boom(new Request('http://shop.test/api/x'), {});
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('secret');
  });
});

describe('admin SQL console', () => {
  let adminId: number;
  beforeEach(async () => {
    await resetData();
    adminId = (await createCustomer()).id;
  });

  it('runs read-only queries against the curated console schema', async () => {
    const result = await runSqlConsole(adminId, 'SELECT 1 AS one, 2 AS one');
    expect(result.columns).toEqual(['one', 'one']);
    expect(result.rows).toEqual([[1, 2]]);
    expect((await runSqlConsole(adminId, 'SELECT count(*) FROM customers')).rows).toEqual([[1]]);
  });

  it.each([
    ['password hashes', 'SELECT password_hash FROM customers'],
    ['private tables', 'SELECT * FROM public.sessions'],
    ['the audit log', 'SELECT * FROM admin_audit_log'],
    ['writes', 'DELETE FROM customers'],
    ['multiple statements', 'SELECT 1; SELECT 2'],
    ['server files', "SELECT pg_read_file('postgresql.conf')"],
    ['shell commands', "COPY (SELECT 1) TO PROGRAM 'true'"],
    ['role switching', 'SET ROLE postgres'],
  ])('denies %s', async (_label, sql) => {
    await expect(runSqlConsole(adminId, sql)).rejects.toMatchObject({ status: 400 });
  });

  it('does not leak session settings between queries', async () => {
    await runSqlConsole(adminId, "SELECT set_config('statement_timeout', '1ms', false)");
    const result = await runSqlConsole(adminId, 'SHOW statement_timeout');
    expect(result.rows[0][0]).not.toBe('1ms');
  });

  it('audits every attempt in an append-only log', async () => {
    await runSqlConsole(adminId, 'SELECT 1');
    await expect(runSqlConsole(adminId, 'DELETE FROM customers')).rejects.toThrow();
    expect((await one<{ n: number }>(`SELECT count(*)::int AS n FROM admin_audit_log`))!.n).toBe(2);
    await expect(exec(`DELETE FROM admin_audit_log`)).rejects.toThrow('append-only');
    await expect(exec(`UPDATE admin_audit_log SET action = 'x'`)).rejects.toThrow('append-only');
  });
});
