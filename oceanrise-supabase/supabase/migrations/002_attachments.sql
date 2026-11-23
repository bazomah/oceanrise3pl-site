-- oceanrise · private storage for attachments (quotes, invoices, receipts, photos)
-- Run once in the SQL Editor after 001_schema.sql.

insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;

-- Path layout: <folder>/<scope>/<file-id>-<name>
--   folder = 'staff'  -> uploaded by staff (quotes, invoices, receipts)
--   folder = <emp id> -> uploaded by that employee (fault photos, request documents)

create policy attachments_read on storage.objects for select to authenticated using (
  bucket_id = 'attachments' and public.app_role() is not null
  and (public.app_role() <> 'employee' or (storage.foldername(name))[1] = public.app_emp()));

create policy attachments_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'attachments' and public.app_role() is not null
  and ((public.app_role() <> 'employee' and (storage.foldername(name))[1] = 'staff')
       or (storage.foldername(name))[1] = public.app_emp()));

create policy attachments_delete on storage.objects for delete to authenticated using (
  bucket_id = 'attachments' and (public.can_do('approvals','edit') or public.can_do('fleet','edit')));
