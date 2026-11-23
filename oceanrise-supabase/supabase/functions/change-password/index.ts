// POST { oldPassword, newPassword } (Authorization: user token)
import { admin, anonClient, cors, json, normPw, requireCaller } from '../_shared/util.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const c = await requireCaller(req); if (c instanceof Response) return c;
  let b: any; try { b = await req.json(); } catch { return json({ error: 'bad' }, 400); }
  const oldPw = normPw(b.oldPassword), nw = normPw(b.newPassword);
  if (nw.length < 8 || !/[A-Za-z]/.test(nw) || !/[0-9]/.test(nw)) return json({ error: 'weak' }, 400);
  if (nw === oldPw) return json({ error: 'same' }, 400);
  const db = admin();
  const { data: au } = await db.auth.admin.getUserById(c.id);
  const { error: e1 } = await anonClient().auth.signInWithPassword({ email: au!.user!.email!, password: oldPw });
  if (e1) return json({ error: 'wrongOld' }, 403);
  const { error: e2 } = await db.auth.admin.updateUserById(c.id, { password: nw });
  if (e2) return json({ error: 'server' }, 500);
  await db.from('profiles').update({ must_change: false }).eq('id', c.id);
  return json({ ok: true });
});
