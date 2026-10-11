import { DatabaseError } from 'pg';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, message, details);
export const unauthorized = (message = 'Please sign in to continue.') => new HttpError(401, message);
export const forbidden = (message = 'You do not have access to this resource.') => new HttpError(403, message);
export const notFound = (message = 'Not found.') => new HttpError(404, message);
export const conflict = (message: string) => new HttpError(409, message);
export const payloadTooLarge = (message = 'Request body is too large.') => new HttpError(413, message);
export const serviceUnavailable = (message: string) => new HttpError(503, message);
export const tooManyRequests = (message: string) => new HttpError(429, message);

/** Translates known failures into HTTP errors; returns null for unexpected errors. */
export function toHttpError(error: unknown): HttpError | null {
  if (error instanceof HttpError) return error;

  if (error instanceof ZodError) {
    const first = error.issues[0];
    const field = first?.path.join('.');
    return badRequest(field ? `${field}: ${first.message}` : first?.message ?? 'Invalid request.', error.issues);
  }

  if (error instanceof SyntaxError) {
    return badRequest('Request body is not valid JSON.');
  }

  if (error instanceof DatabaseError) {
    switch (error.code) {
      case '23505':
        return conflict('That record already exists.');
      case '23503':
        return conflict('That change references a record that does not exist or is still in use.');
      case '23514':
      case '22P02':
      case '22003':
        return badRequest('One or more values are out of range.');
    }
  }

  return null;
}
