import { createHash } from 'crypto';
import { MAX_IMAGE_BYTES } from '@/lib/constants';
import { badRequest } from '../errors';
import { one, type Queryable } from '../db';

/** Identifies the image format from its magic bytes; file names and client MIME types are not trusted. */
export function detectImageType(data: Buffer) {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (data.length >= 12 && data.toString('latin1', 0, 4) === 'RIFF' && data.toString('latin1', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (data.length >= 12 && data.toString('latin1', 4, 8) === 'ftyp' && ['avif', 'avis'].includes(data.toString('latin1', 8, 12))) {
    return 'image/avif';
  }
  return null;
}

/** Stores an image (deduplicated by content hash) and returns its id. */
export async function storeImage(db: Queryable, data: Buffer) {
  if (data.length === 0) throw badRequest('Image file is empty.');
  if (data.length > MAX_IMAGE_BYTES) throw badRequest('Images must be 5 MB or smaller.');

  const contentType = detectImageType(data);
  if (!contentType) throw badRequest('Only JPG, PNG, WEBP and AVIF images are supported.');

  const sha256 = createHash('sha256').update(data).digest('hex');
  const row = await one<{ id: string }>(
    `INSERT INTO product_images (content_type, data, sha256)
     VALUES ($1, $2, $3)
     ON CONFLICT (sha256) DO UPDATE SET sha256 = EXCLUDED.sha256
     RETURNING image_id AS id`,
    [contentType, data, sha256],
    db
  );
  return row!.id;
}

export async function getImage(imageId: string) {
  return one<{ contentType: string; data: Buffer; sha256: string }>(
    `SELECT content_type AS "contentType", data, sha256 FROM product_images WHERE image_id = $1`,
    [imageId]
  );
}
