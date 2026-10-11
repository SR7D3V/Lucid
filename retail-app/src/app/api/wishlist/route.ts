import { json, route } from '@/server/http';
import { requireUser } from '@/server/session';
import { listWishlist } from '@/server/services/wishlist';

export const GET = route(async () => {
  const user = await requireUser();
  return json(await listWishlist(user.id));
});
