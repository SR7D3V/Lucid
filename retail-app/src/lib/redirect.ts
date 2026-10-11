const BASE = 'http://lucid.invalid';

/**
 * Returns `value` only if it is a same-site path, otherwise `fallback`. Parsing with the URL
 * constructor (the same way browsers do) defeats tricks like "//evil.com", "/\evil.com" and
 * "/<TAB>/evil.com", and control characters are rejected outright.
 */
export function safeNextPath(value: string | null | undefined, fallback = '/account') {
  if (!value || !value.startsWith('/') || /[\x00-\x1f\x7f\\]/.test(value)) return fallback;
  try {
    const url = new URL(value, BASE);
    if (url.origin !== BASE) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
