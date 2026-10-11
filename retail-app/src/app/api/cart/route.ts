import { json, route } from '@/server/http';
import { getCartId } from '@/server/session';
import { getCart } from '@/server/services/cart';

export const GET = route(async () => json(await getCart(await getCartId())));
