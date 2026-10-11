import { one } from '@/server/db';
import { json, route } from '@/server/http';

export const GET = route(async () => {
  const started = performance.now();
  try {
    await one('SELECT 1');
    return json({ status: 'ok', database: 'ok', latencyMs: Math.round(performance.now() - started) });
  } catch {
    return json({ status: 'degraded', database: 'unreachable' }, 503);
  }
});
