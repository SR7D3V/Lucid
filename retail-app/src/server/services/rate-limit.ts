import { tooManyRequests } from '../errors';
import { exec, one } from '../db';

/*
 * Fixed-window counters backed by Postgres, so limits hold across multiple app instances.
 * A window resets once `windowSeconds` have passed since its first hit.
 */

function limitError(retryAfterSeconds: number) {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return tooManyRequests(`Too many attempts. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
}

/** Records a hit and returns the hit count within the current window. */
export async function recordHit(bucket: string, windowSeconds: number) {
  const row = await one<{ hits: number; retryAfter: number }>(
    `INSERT INTO rate_limits AS r (bucket, hits, window_started_at)
     VALUES ($1, 1, now())
     ON CONFLICT (bucket) DO UPDATE SET
       hits = CASE WHEN r.window_started_at <= now() - make_interval(secs => $2) THEN 1 ELSE r.hits + 1 END,
       window_started_at = CASE WHEN r.window_started_at <= now() - make_interval(secs => $2)
                                THEN now() ELSE r.window_started_at END
     RETURNING hits,
               ceil(extract(epoch FROM r.window_started_at + make_interval(secs => $2) - now()))::integer AS "retryAfter"`,
    [bucket, windowSeconds]
  );
  return row!;
}

/** Counts this request against the bucket and rejects it once the limit is exceeded. */
export async function enforceRateLimit(bucket: string, limit: number, windowSeconds: number) {
  const { hits, retryAfter } = await recordHit(bucket, windowSeconds);
  if (hits > limit) throw limitError(retryAfter);
}

/** Rejects if the bucket is already over its limit, without counting this request. */
export async function assertUnderLimit(bucket: string, limit: number, windowSeconds: number) {
  const row = await one<{ retryAfter: number }>(
    `SELECT ceil(extract(epoch FROM window_started_at + make_interval(secs => $3) - now()))::integer AS "retryAfter"
     FROM rate_limits
     WHERE bucket = $1 AND hits >= $2 AND window_started_at > now() - make_interval(secs => $3)`,
    [bucket, limit, windowSeconds]
  );
  if (row) throw limitError(row.retryAfter);
}

export async function clearRateLimit(bucket: string) {
  await exec(`DELETE FROM rate_limits WHERE bucket = $1`, [bucket]);
}
