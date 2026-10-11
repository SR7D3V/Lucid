import { json, route } from '@/server/http';
import { listCategories } from '@/server/services/catalog';

export const GET = route(async () =>
  json(await listCategories(), 200, { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' })
);
