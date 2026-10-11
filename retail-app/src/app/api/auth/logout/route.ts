import { route } from '@/server/http';
import { signOut } from '@/server/session';

export const POST = route(async () => {
  await signOut();
  return new Response(null, { status: 204 });
});
