import { badRequest } from '@/server/errors';
import { json, readForm, route } from '@/server/http';
import { MAX_IMAGE_BYTES } from '@/lib/constants';
import { requireAdmin } from '@/server/session';
import { recordAudit } from '@/server/services/admin';
import { createProduct, listProducts } from '@/server/services/catalog';
import { newProductSchema, productQuerySchema } from '@/server/validation';

export const GET = route(async (req) => {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const { sub, ...filters } = productQuerySchema.parse(params);
  return json(await listProducts({ ...filters, subcategory: sub }));
});

export const POST = route(async (req) => {
  const admin = await requireAdmin();
  const form = await readForm(req, MAX_IMAGE_BYTES + 64 * 1024);
  const image = form.get('image');
  if (!(image instanceof File) || image.size === 0) throw badRequest('image: a product image is required');

  const input = newProductSchema.parse(Object.fromEntries([...form.entries()].filter(([key]) => key !== 'image')));
  const product = await createProduct({ ...input, image: Buffer.from(await image.arrayBuffer()) });
  await recordAudit(admin.id, 'product.create', { productId: product.id, name: product.name });
  return json({ product }, 201);
});
