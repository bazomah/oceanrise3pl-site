// POST { username, password } -> { access_token, refresh_token, ... }
// Lets people sign in with the employee number. Same generic error for every failure (no user enumeration).
import { admin, anonClient, cors, internalEmail, json, normPw } from '../_shared/util.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  let b: any; try { b = await req.json(); } catch { return json({ error: 'bad' }, 400); }
  const username = String(b.username || '').trim();
  const password = normPw(b.password);
  if (!username || !password) return json({ error: 'invalid' }, 401);

  const db = admin();
  const { data: p } = await db.from('profiles').select('id,status').ilike('username', username.replace(/[%_]/g, '\\$&')).maybeSingle();
  if (!p || p.status !== 'active') return json({ error: 'invalid' }, 401);
  const { data: au } = await db.auth.admin.getUserById(p.id);
  const email = au?.user?.email || internalEmail(p.id);

  const { data, error } = await anonClient().auth.signInWithPassword({ email, password });
  if (error || !data.session) return json({ error: error?.status === 429 ? 'locked' : 'invalid' }, error?.status === 429 ? 429 : 401);
  return json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token, expires_in: data.session.expires_in, user_id: p.id });
});
