import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';

// Supabase Auth needs an email as its internal identifier. It is never shown, never emailed
// (accounts are created pre-confirmed) and never typed by anyone: people sign in with the employee number.
export const INTERNAL_DOMAIN = 'oceanrise.internal';
export const internalEmail = (profileKey: string) => `${profileKey.toLowerCase()}@${INTERNAL_DOMAIN}`;

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export const URL_ = Deno.env.get('SUPABASE_URL')!;
export const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
export const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
export const admin = (): SupabaseClient => createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
export const anonClient = (): SupabaseClient => createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

export function genPassword(): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const buf = new Uint32Array(10); crypto.getRandomValues(buf);
  return Array.from(buf, (n) => A[n % A.length]).join('');
}
export const normPw = (s: unknown) => String(s ?? '').replace(/[\s-]/g, '');

export type Caller = { id: string; role: string; empId: string; db: SupabaseClient };
// Verifies the caller's JWT and loads their profile + the permission matrix.
export async function requireCaller(req: Request): Promise<Caller | Response> {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'auth' }, 401);
  const db = admin();
  const { data: u, error } = await db.auth.getUser(token);
  if (error || !u?.user) return json({ error: 'auth' }, 401);
  const { data: p } = await db.from('profiles').select('role,status,emp_id,must_change').eq('id', u.user.id).maybeSingle();
  if (!p || p.status !== 'active') return json({ error: 'auth' }, 401);
  return { id: u.user.id, role: p.role, empId: p.emp_id, db, mustChange: p.must_change } as Caller & { mustChange: boolean };
}
export async function canDo(db: SupabaseClient, role: string, page: string, lvl: 'view' | 'edit' | 'approve') {
  const { data } = await db.from('settings').select('value').eq('key', 'perms').maybeSingle();
  const p = data?.value?.[role]?.[page];
  const order = ['none', 'view', 'edit', 'approve'];
  return order.indexOf(p ?? 'none') >= order.indexOf(lvl);
}
