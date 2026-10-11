import { idParam, route } from '@/server/http';
import { requireUser } from '@/server/session';
import { addToWishlist, removeFromWishlist } from '@/server/services/wishlist';

type Ctx = { params: Promise<{ productId: string }> };

export const PUT = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  await addToWishlist(user.id, idParam((await params).productId));
  return new Response(null, { status: 204 });
});

export const DELETE = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  await removeFromWishlist(user.id, idParam((await params).productId));
  return new Response(null, { status: 204 });
});
