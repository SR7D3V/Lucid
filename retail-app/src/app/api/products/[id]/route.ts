import { notFound } from '@/server/errors';
import { idParam, json, readJson, route } from '@/server/http';
import { requireAdmin } from '@/server/session';
import { recordAudit } from '@/server/services/admin';
import { archiveProduct, getProduct, updateProduct } from '@/server/services/catalog';
import { productPatchSchema } from '@/server/validation';

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req, { params }: Ctx) => {
  const product = await getProduct(idParam((await params).id));
  if (!product) throw notFound('Product not found.');
  return json(product);
});

export const PATCH = route(async (req, { params }: Ctx) => {
  const admin = await requireAdmin();
  const productId = idParam((await params).id);
  const patch = await readJson(req, productPatchSchema);
  const product = await updateProduct(productId, patch);
  await recordAudit(admin.id, 'product.update', { productId, patch });
  return json({ product });
});

export const DELETE = route(async (_req, { params }: Ctx) => {
  const admin = await requireAdmin();
  const productId = idParam((await params).id);
  await archiveProduct(productId);
  await recordAudit(admin.id, 'product.archive', { productId });
  return new Response(null, { status: 204 });
});
