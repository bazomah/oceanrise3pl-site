// POST (Authorization: user token)
//  { action:'create', empId?, username?, name, email?, role }  -> creates the login, returns { user, password }
//  { action:'reset',  userId }                                  -> new temporary password
//  { action:'delete', userId }                                  -> removes the login
// Username = employee number when the account is linked to an employee. The password is generated here.
import { admin, canDo, cors, genPassword, INTERNAL_DOMAIN, json, requireCaller } from '../_shared/util.ts';

const ROLES = ['ceo', 'hr', 'ops', 'fleet', 'employee'];
const toUser = (p: any) => ({ id: p.id, name: p.name, email: p.email, role: p.role, status: p.status, empId: p.emp_id, username: p.username, mustChange: p.must_change });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const c: any = await requireCaller(req); if (c instanceof Response) return c;
  if (c.mustChange) return json({ error: 'must_change' }, 403);
  let b: any; try { b = await req.json(); } catch { return json({ error: 'bad' }, 400); }
  const db = c.db;
  const isUsersAdmin = await canDo(db, c.role, 'users', 'edit');
  const isPeopleAdmin = await canDo(db, c.role, 'people', 'edit');

  if (b.action === 'create') {
    const role = String(b.role || 'employee');
    if (!ROLES.includes(role)) return json({ error: 'role' }, 400);
    // HR-type editors may only create employee logins for existing employees; Users admins can create anything.
    if (!isUsersAdmin && !(isPeopleAdmin && role === 'employee' && b.empId)) return json({ error: 'forbidden' }, 403);
    const empId = String(b.empId || '').trim();
    let emp: any = null;
    if (empId) {
      const { data } = await db.from('employees').select('id,data').eq('id', empId).maybeSingle();
      if (!data) return json({ error: 'noemp' }, 404);
      emp = data;
    }
    const username = String(empId || b.username || '').trim();
    if (!/^[A-Za-z0-9._-]{2,40}$/.test(username)) return json({ error: 'username' }, 400);
    const { data: clash } = await db.from('profiles').select('id').ilike('username', username.replace(/[%_]/g, '\\$&')).maybeSingle();
    if (clash) return json({ error: 'clash' }, 409);
    const password = genPassword();
    const tmpEmail = `${crypto.randomUUID()}@${INTERNAL_DOMAIN}`;
    const { data: created, error } = await db.auth.admin.createUser({ email: tmpEmail, password, email_confirm: true });
    if (error || !created.user) return json({ error: 'server', detail: error?.message }, 500);
    const name = String(b.name || emp?.data?.name || '').trim();
    const row = { id: created.user.id, username, name, email: String(b.email || emp?.data?.email || ''), role, status: 'active', emp_id: empId, must_change: true };
    const { data: p, error: e2 } = await db.from('profiles').insert(row).select().single();
    if (e2) { await db.auth.admin.deleteUser(created.user.id); return json({ error: 'server', detail: e2.message }, 500); }
    return json({ user: toUser(p), username, password });
  }

  const { data: t } = await db.from('profiles').select('*').eq('id', String(b.userId || '')).maybeSingle();
  if (!t) return json({ error: 'nouser' }, 404);
  if (t.id === c.id) return json({ error: 'self' }, 400);
  if (!(isUsersAdmin || (isPeopleAdmin && t.role === 'employee'))) return json({ error: 'forbidden' }, 403);

  if (b.action === 'reset') {
    const password = genPassword();
    const { error } = await db.auth.admin.updateUserById(t.id, { password });
    if (error) return json({ error: 'server' }, 500);
    await db.from('profiles').update({ must_change: true }).eq('id', t.id);
    return json({ user: toUser({ ...t, must_change: true }), username: t.username, password });
  }
  if (b.action === 'delete') {
    if (!isUsersAdmin) return json({ error: 'forbidden' }, 403);
    const { error } = await db.auth.admin.deleteUser(t.id);
    if (error) return json({ error: 'server' }, 500);
    return json({ ok: true });
  }
  return json({ error: 'action' }, 400);
});
