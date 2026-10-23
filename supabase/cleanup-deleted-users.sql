-- When someone is deleted under Authentication → Users,
-- also remove their report access and uploader status.
create or replace function public.cleanup_deleted_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.report_access where email = lower(old.email);
  delete from public.uploaders where lower(email) = lower(old.email);
  return old;
end;
$$;

drop trigger if exists cleanup_deleted_user on auth.users;
create trigger cleanup_deleted_user
  after delete on auth.users
  for each row execute function public.cleanup_deleted_user();
  