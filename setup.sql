-- SJN Reports — Supabase setup
-- Paste all of this into Supabase: SQL Editor → New query → Run.
-- It's safe to run again if you need to.
--
-- Who can do what:
--   • Anyone you add under Authentication → Users can sign in and read every report.
--   • People listed in the "uploaders" table can also upload, edit and delete reports.
--   • Nobody else can see anything: the storage bucket is private and every table has access rules.

-- 1. People allowed to upload (add rows in Table Editor → uploaders)
create table if not exists public.uploaders (
  email text primary key,
  added_at timestamptz not null default now()
);
alter table public.uploaders enable row level security;
-- No policies on purpose: only you, in the dashboard, can see or change this list.
revoke all on public.uploaders from anon, authenticated;

-- Answers "is the signed-in person an uploader?" without exposing the list itself
create or replace function public.is_uploader()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.uploaders u
    where lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function public.is_uploader() from public, anon;
grant execute on function public.is_uploader() to authenticated;

-- 2. The list of reports (titles, summaries, where each file is stored)
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 300),
  summary text not null default '' check (char_length(summary) <= 1000),
  file_name text not null,
  storage_path text not null unique,
  uploader_name text not null default '' check (char_length(uploader_name) <= 100),
  uploaded_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.reports enable row level security;
revoke all on public.reports from anon;
grant select, insert, update, delete on public.reports to authenticated;

drop policy if exists "Signed-in people can read reports" on public.reports;
create policy "Signed-in people can read reports" on public.reports
  for select to authenticated using (true);

drop policy if exists "Uploaders can add reports" on public.reports;
create policy "Uploaders can add reports" on public.reports
  for insert to authenticated with check (public.is_uploader());

drop policy if exists "Uploaders can edit reports" on public.reports;
create policy "Uploaders can edit reports" on public.reports
  for update to authenticated using (public.is_uploader()) with check (public.is_uploader());

drop policy if exists "Uploaders can delete reports" on public.reports;
create policy "Uploaders can delete reports" on public.reports
  for delete to authenticated using (public.is_uploader());

-- 3. Private storage for the report files (HTML only, up to 20 MB each)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reports', 'reports', false, 20971520, array['text/html'])
on conflict (id) do update
  set public = false, file_size_limit = 20971520, allowed_mime_types = array['text/html'];

drop policy if exists "Signed-in people can read report files" on storage.objects;
create policy "Signed-in people can read report files" on storage.objects
  for select to authenticated using (bucket_id = 'reports');

drop policy if exists "Uploaders can add report files" on storage.objects;
create policy "Uploaders can add report files" on storage.objects
  for insert to authenticated with check (bucket_id = 'reports' and public.is_uploader());

drop policy if exists "Uploaders can replace report files" on storage.objects;
create policy "Uploaders can replace report files" on storage.objects
  for update to authenticated using (bucket_id = 'reports' and public.is_uploader());

drop policy if exists "Uploaders can delete report files" on storage.objects;
create policy "Uploaders can delete report files" on storage.objects
  for delete to authenticated using (bucket_id = 'reports' and public.is_uploader());

-- 4. Add the first uploaders (edit these emails, then run). You can add more later in Table Editor.
insert into public.uploaders (email) values
('marie@solutionsjournalism.org'),
('david@solutionsjournalism.org')
on conflict do nothing;
