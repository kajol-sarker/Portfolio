-- Run this in the Supabase SQL Editor. The policy is restricted to the portfolio owner email configured below.
create table if not exists public.admin_entries (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('personal','contact','experience','education','skills','project','note','alarm','message','academic','industry','career','document','license')),
  title text not null check (char_length(title) between 1 and 140),
  content text not null check (char_length(content) between 1 and 12000),
  alarm_at timestamptz,
  alarm_fired_at timestamptz,
  file_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_entries add column if not exists alarm_at timestamptz;
alter table public.admin_entries add column if not exists alarm_fired_at timestamptz;
alter table public.admin_entries add column if not exists file_path text;
alter table public.admin_entries drop constraint if exists admin_entries_category_check;
alter table public.admin_entries add constraint admin_entries_category_check
  check (category in ('personal','contact','experience','education','skills','project','note','alarm','message','academic','industry','career','document','license'));

alter table public.admin_entries enable row level security;

-- Remove earlier policies of the same names to keep this script safe to re-run.
drop policy if exists "Admin can read own entries" on public.admin_entries;
drop policy if exists "Admin can create entries" on public.admin_entries;
drop policy if exists "Admin can update entries" on public.admin_entries;
drop policy if exists "Admin can delete entries" on public.admin_entries;

create policy "Admin can read own entries" on public.admin_entries
  for select to authenticated
  using (lower((select auth.jwt() ->> 'email')) = lower('mdmuntasir865@gmail.com'));
create policy "Admin can create entries" on public.admin_entries
  for insert to authenticated
  with check (lower((select auth.jwt() ->> 'email')) = lower('mdmuntasir865@gmail.com'));
create policy "Admin can update entries" on public.admin_entries
  for update to authenticated
  using (lower((select auth.jwt() ->> 'email')) = lower('mdmuntasir865@gmail.com'))
  with check (lower((select auth.jwt() ->> 'email')) = lower('mdmuntasir865@gmail.com'));
create policy "Admin can delete entries" on public.admin_entries
  for delete to authenticated
  using (lower((select auth.jwt() ->> 'email')) = lower('mdmuntasir865@gmail.com'));

drop policy if exists "Require MFA for admin entries" on public.admin_entries;
create policy "Require MFA for admin entries" on public.admin_entries
  as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.jwt() ->> 'aal') = 'aal2');

create or replace function public.set_admin_entries_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists admin_entries_updated_at on public.admin_entries;
create trigger admin_entries_updated_at before update on public.admin_entries
for each row execute function public.set_admin_entries_updated_at();

-- Private file storage for academic/job records, licenses, and documents.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'admin-documents',
  'admin-documents',
  false,
  15728640,
  array['application/pdf','image/jpeg','image/png','image/webp','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admin MFA can read private documents" on storage.objects;
drop policy if exists "Admin MFA can upload private documents" on storage.objects;
drop policy if exists "Admin MFA can update private documents" on storage.objects;
drop policy if exists "Admin MFA can delete private documents" on storage.objects;

create policy "Admin MFA can read private documents" on storage.objects
  for select to authenticated
  using (bucket_id = 'admin-documents'
    and lower((select auth.jwt() ->> 'email')) = lower('mdmuntasir865@gmail.com')
    and (select auth.jwt() ->> 'aal') = 'aal2');
create policy "Admin MFA can upload private documents" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'admin-documents'
    and lower((select auth.jwt() ->> 'email')) = lower('mdmuntasir865@gmail.com')
    and (select auth.jwt() ->> 'aal') = 'aal2');
create policy "Admin MFA can update private documents" on storage.objects
  for update to authenticated
  using (bucket_id = 'admin-documents'
    and lower((select auth.jwt() ->> 'email')) = lower('mdmuntasir865@gmail.com')
    and (select auth.jwt() ->> 'aal') = 'aal2')
  with check (bucket_id = 'admin-documents'
    and lower((select auth.jwt() ->> 'email')) = lower('mdmuntasir865@gmail.com')
    and (select auth.jwt() ->> 'aal') = 'aal2');
create policy "Admin MFA can delete private documents" on storage.objects
  for delete to authenticated
  using (bucket_id = 'admin-documents'
    and lower((select auth.jwt() ->> 'email')) = lower('mdmuntasir865@gmail.com')
    and (select auth.jwt() ->> 'aal') = 'aal2');
