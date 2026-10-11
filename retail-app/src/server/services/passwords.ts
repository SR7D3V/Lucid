import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(scryptCallback) as (password: string, salt: string, keylen: number) => Promise<Buffer>;
const PREFIX = 'scrypt';
const KEY_LENGTH = 64;

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, KEY_LENGTH);
  return `${PREFIX}:${salt}:${hash.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [prefix, salt, hash] = stored.split(':');
  if (prefix !== PREFIX || !salt || !hash) return false;

  const expected = Buffer.from(hash, 'hex');
  const derived = await scrypt(password, salt, expected.length);
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

// Verifying against a throwaway hash keeps response time constant when the email is unknown.
const dummyHash = hashPassword(randomBytes(16).toString('hex'));
export async function burnPasswordCheck(password: string) {
  await verifyPassword(password, await dummyHash);
}
