import 'server-only';
import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { env } from './env';
import { badRequest, forbidden, notFound, payloadTooLarge, toHttpError } from './errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const DEFAULT_JSON_LIMIT = 16 * 1024;

export const json = <T>(data: T, status = 200, headers?: HeadersInit) => NextResponse.json(data, { status, headers });

/**
 * Wraps a route handler with CSRF protection for state-changing requests and uniform error
 * responses: expected failures map to 4xx with a message, anything else is logged and returns 500.
 */
export function route<Ctx>(handler: (req: Request, ctx: Ctx) => Promise<Response>) {
  return async (req: Request, ctx: Ctx) => {
    try {
      if (!SAFE_METHODS.has(req.method)) assertSameOrigin(req);
      return await handler(req, ctx);
    } catch (error) {
      const httpError = toHttpError(error);
      if (httpError) return json({ error: httpError.message }, httpError.status);

      const requestId = crypto.randomUUID();
      console.error(
        JSON.stringify({
          level: 'error',
          requestId,
          method: req.method,
          path: new URL(req.url).pathname,
          error: error instanceof Error ? error.stack : String(error),
        })
      );
      return json({ error: 'Something went wrong. Please try again.', requestId }, 500);
    }
  };
}

/**
 * Browsers always send Origin on cross-site non-GET requests, so a mismatch means CSRF. Requests
 * without Origin come from non-browser clients, which cannot ride on a user's cookies.
 */
function assertSameOrigin(req: Request) {
  const origin = req.headers.get('origin');
  if (origin === null) return;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw forbidden('Cross-site request blocked.');
  }

  const { APP_ORIGIN } = env();
  const expectedHost = APP_ORIGIN ? new URL(APP_ORIGIN).host : req.headers.get('host');
  if (originHost !== expectedHost) throw forbidden('Cross-site request blocked.');
}

/** Reads the body as text, aborting as soon as it exceeds `maxBytes` (never buffers more). */
async function readCapped(req: Request, maxBytes: number) {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw payloadTooLarge();
  if (!req.body) return '';

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw payloadTooLarge();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function readJson<S extends z.ZodType>(req: Request, schema: S, maxBytes = DEFAULT_JSON_LIMIT): Promise<z.infer<S>> {
  const text = await readCapped(req, maxBytes);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw badRequest('Request body is not valid JSON.');
  }
  return schema.parse(body);
}

/** Parses multipart form data, requiring a declared Content-Length within `maxBytes`. */
export async function readForm(req: Request, maxBytes: number) {
  const declared = Number(req.headers.get('content-length'));
  if (!Number.isFinite(declared) || declared <= 0) throw badRequest('Content-Length is required.');
  if (declared > maxBytes) throw payloadTooLarge();
  return req.formData();
}

/**
 * The client's IP as seen by our own infrastructure. Each trusted proxy appends the address it
 * received the request from, so the entry TRUSTED_PROXY_HOPS from the right cannot be forged by
 * the client (anything further left can). With no proxy, the header itself is untrusted.
 */
export function clientIp(req: Request) {
  const hops = env().TRUSTED_PROXY_HOPS;
  const chain = (req.headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (hops === 0 || chain.length === 0) return 'direct';
  return chain[Math.max(0, chain.length - hops)];
}

/**
 * The site's public origin for links sent outside the app (e.g. reset emails). Production uses the
 * configured APP_ORIGIN only: deriving it from the Host header would let an attacker point a
 * victim's reset link at their own domain.
 */
export function publicOrigin(req: Request) {
  const { APP_ORIGIN, NODE_ENV } = env();
  if (APP_ORIGIN) return new URL(APP_ORIGIN).origin;
  if (NODE_ENV === 'production') throw new Error('APP_ORIGIN must be set to send links by email.');
  return new URL(req.url).origin;
}

/** Parses a positive integer route param, throwing a 404 for anything else. */
export function idParam(value: string) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw notFound();
  return id;
}
