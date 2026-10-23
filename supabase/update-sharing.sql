-- SJN Reports — update: share each report with specific people
-- Run once in Supabase: SQL Editor → New query → paste all of this → Run.
-- (setup.sql must already have been run. Safe to run again.)
--
-- After this:
--   • Uploaders still see and manage every report.
--   • Everyone else sees only the reports shared with them, until their access expires or is removed.
--   • Section 5 keeps today's readers from losing anything: it shares every existing report with them.

-- 1. The signed-in person's email, lowercased
create or replace function public.current_email()
returns text
language sql
stable
set search_path = ''
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

-- 2. Who can see which report, and until when (no end date = until removed)
create table if not exists public.report_access (
  report_id uuid not null references public.reports (id) on delete cascade,
  email text not null check (email = lower(email) and position('@' in email) > 1),
  expires_at timestamptz,
  granted_by uuid default auth.uid() references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (report_id, email)
);
create index if not exists report_access_email_idx on public.report_access (email);
alter table public.report_access enable row level security;
revoke all on public.report_access from anon;
grant select, insert, update, delete on public.report_access to authenticated;

drop policy if exists "Uploaders manage sharing" on public.report_access;
create policy "Uploaders manage sharing" on public.report_access
  for all to authenticated using (public.is_uploader()) with check (public.is_uploader());

drop policy if exists "People see their own access" on public.report_access;
create policy "People see their own access" on public.report_access
  for select to authenticated using (email = public.current_email());

-- 3. Checks used by the access rules below
create or replace function public.can_read_report(rid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_uploader() or exists (
    select 1 from public.report_access a
    where a.report_id = rid
      and a.email = public.current_email()
      and (a.expires_at is null or a.expires_at > now())
  );
$$;

create or replace function public.can_read_report_file(path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_uploader() or exists (
    select 1 from public.reports r
    join public.report_access a on a.report_id = r.id
    where r.storage_path = path
      and a.email = public.current_email()
      and (a.expires_at is null or a.expires_at > now())
  );
$$;

revoke all on function public.can_read_report(uuid) from public, anon;
revoke all on function public.can_read_report_file(text) from public, anon;
grant execute on function public.can_read_report(uuid) to authenticated;
grant execute on function public.can_read_report_file(text) to authenticated;

-- 4. Replace "anyone signed in can read" with "only people it's shared with"
drop policy if exists "Signed-in people can read reports" on public.reports;
drop policy if exists "People can read reports shared with them" on public.reports;
create policy "People can read reports shared with them" on public.reports
  for select to authenticated using (public.can_read_report(id));

drop policy if exists "Signed-in people can read report files" on storage.objects;
drop policy if exists "People can read report files shared with them" on storage.objects;
create policy "People can read report files shared with them" on storage.objects
  for select to authenticated using (bucket_id = 'reports' and public.can_read_report_file(name));

-- 5. One-time: give everyone who has access today every existing report, with no end date,
--    so nothing changes for them. Remove individual reports from people afterwards in the site.
insert into public.report_access (report_id, email)
select r.id, lower(u.email)
from public.reports r
cross join auth.users u
where u.email is not null
  and lower(u.email) not in (select lower(email) from public.uploaders)
on conflict (report_id, email) do nothing;
