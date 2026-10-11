import { notFound } from '@/server/errors';
import { route } from '@/server/http';
import { getImage } from '@/server/services/images';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Image ids are content-addressed and never reused, so responses are cached forever.
export const GET = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  if (!UUID.test(id)) throw notFound();

  const image = await getImage(id);
  if (!image) throw notFound();

  const etag = `"${image.sha256}"`;
  const headers = {
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Content-Type': image.contentType,
    ETag: etag,
    'X-Content-Type-Options': 'nosniff',
  };
  if (req.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });
  return new Response(new Uint8Array(image.data), { headers });
});
