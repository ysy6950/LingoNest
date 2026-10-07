-- Version 3.0 stores one recoverable copy of the existing local v2 snapshot.
-- This is backup/restore, not concurrent multi-device editing or row-level sync.
create table if not exists public.user_backups (
  user_id uuid primary key references auth.users (id) on delete cascade,
  revision bigint not null check (revision > 0),
  snapshot jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.user_backups enable row level security;

revoke all on public.user_backups from public, anon, authenticated;
grant select on public.user_backups to authenticated;

create policy "Users can read their own backup"
  on public.user_backups
  for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Only this function may write backups. It derives the owner from the verified
-- request token and compares revisions atomically, preventing stale devices
-- from silently overwriting newer cloud data.
create or replace function public.save_lingonest_backup(
  p_snapshot jsonb,
  p_expected_revision bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_new_revision bigint;
begin
  if v_user_id is null then
    raise exception 'Sign in before saving a backup' using errcode = '28000';
  end if;

  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'Invalid expected revision' using errcode = '22023';
  end if;

  if p_snapshot is null
     or jsonb_typeof(p_snapshot) <> 'object'
     or p_snapshot ->> 'version' <> '2'
     or jsonb_typeof(p_snapshot -> 'cards') <> 'array'
     or jsonb_typeof(p_snapshot -> 'groups') <> 'array'
     or jsonb_typeof(p_snapshot -> 'reviews') <> 'object'
     or octet_length(p_snapshot::text) > 5242880 then
    raise exception 'Invalid or oversized backup' using errcode = '22023';
  end if;

  -- JSON shape is verified again by the app before a restore. The database
  -- checks the top-level contract and size to reject obvious bad uploads.

  if p_expected_revision = 0 then
    insert into public.user_backups (user_id, revision, snapshot)
    values (v_user_id, 1, p_snapshot)
    on conflict (user_id) do nothing
    returning revision into v_new_revision;
  else
    update public.user_backups
       set revision = revision + 1,
           snapshot = p_snapshot,
           updated_at = now()
     where user_id = v_user_id
       and revision = p_expected_revision
     returning revision into v_new_revision;
  end if;

  if v_new_revision is null then
    raise exception 'Backup revision conflict' using errcode = '40001';
  end if;

  return v_new_revision;
end;
$$;

revoke all on function public.save_lingonest_backup(jsonb, bigint) from public, anon;
grant execute on function public.save_lingonest_backup(jsonb, bigint) to authenticated;
