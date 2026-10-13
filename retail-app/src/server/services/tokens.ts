import { createHash, randomBytes } from 'crypto';

/** A 256-bit random token, URL-safe. */
export const generateToken = () => randomBytes(32).toString('base64url');

/** Tokens are stored only as SHA-256 hashes; the raw value lives with the user (cookie or link). */
export const hashToken = (token: string) => createHash('sha256').update(token).digest();
