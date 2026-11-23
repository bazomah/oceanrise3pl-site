// One-time creation of the first CEO account. Refuses to run once any profile exists.
// curl -X POST "$SUPABASE_URL/functions/v1/bootstrap" -H "apikey: $ANON" -H "x-bootstrap-token: <BOOTSTRAP_TOKEN>"
import { admin, cors, genPassword, INTERNAL_DOMAIN, json } from '../_shared/util.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const secret = Deno.env.get('BOOTSTRAP_TOKEN');
  if (!secret || req.headers.get('x-bootstrap-token') !== secret) return json({ error: 'forbidden' }, 403);
  const db = admin();
  const { count } = await db.from('profiles').select('id', { count: 'exact', head: true });
  if ((count ?? 0) > 0) return json({ error: 'already_initialised' }, 409);
  const password = genPassword();
  const { data: u, error } = await db.auth.admin.createUser({ email: `admin@${INTERNAL_DOMAIN}`, password, email_confirm: true });
  if (error || !u.user) return json({ error: 'server', detail: error?.message }, 500);
  const { error: e2 } = await db.from('profiles').insert({ id: u.user.id, username: 'admin', name: '', email: '', role: 'ceo', status: 'active', emp_id: '', must_change: true });
  if (e2) { await db.auth.admin.deleteUser(u.user.id); return json({ error: 'server', detail: e2.message }, 500); }
  return json({ username: 'admin', password, note: 'Sign in and choose a new password immediately.' });
});
