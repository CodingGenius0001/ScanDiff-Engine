-- Run in the Supabase SQL editor. Safe to re-run: it also upgrades a database
-- set up with the earlier, open version of this file.
--
-- Access model. Every item has a row in public.items and a member list in
-- public.item_members. A signed-in user reads an item's scans, and lists or
-- uploads its files in Storage, only while they are a member of the item:
--
--   owner   created the item: listed it on the website, or scanned its first
--           baseline in the app. Only the owner uploads baselines.
--   member  joined through the item's share link, which carries its invite
--           code. Uploads check scans and records the accept/dispute decision.
--
-- Signed-out (anon) requests see nothing. The engine reads and writes with the
-- secret key, which bypasses row-level security.
--
-- The scans bucket stays public, so a file can be downloaded by its URL. URLs
-- contain the scan's random UUID, which only members can read from the table,
-- and listing the bucket is limited to members.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.scans (
  id uuid primary key,
  item_id text not null,
  version int not null,
  kind text not null check (kind in ('baseline', 'check')),
  model_url text,
  sha256 text,
  created_by text default (auth.uid()::text),
  created_at timestamptz not null default now(),
  decision text check (decision in ('accept', 'dispute'))
);
alter table public.scans alter column created_by set default (auth.uid()::text);

create index if not exists scans_item_kind_created on public.scans (item_id, kind, created_at desc);
create index if not exists scans_item_version on public.scans (item_id, version desc);

create table if not exists public.items (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{1,64}$'),
  -- Null for reserved ids and for items scanned before accounts existed.
  owner_id uuid references auth.users (id) on delete set null,
  invite_code text not null unique default encode(extensions.gen_random_bytes(12), 'hex'),
  created_at timestamptz not null default now()
);

create table if not exists public.item_members (
  item_id text not null references public.items (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (item_id, user_id)
);
create index if not exists item_members_user on public.item_members (user_id);

-- ---------------------------------------------------------------------------
-- Membership checks, used by the policies below. Security definer so a policy
-- on item_members can be evaluated without recursing into itself.
-- ---------------------------------------------------------------------------

create or replace function public.is_item_member(p_item_id text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.item_members m
    where m.item_id = p_item_id and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_item_owner(p_item_id text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.item_members m
    where m.item_id = p_item_id and m.user_id = (select auth.uid()) and m.role = 'owner'
  );
$$;

-- A file in the scans bucket may be written at <item_id>/<scan_id>/<file> by
-- a member of the item, unless that scan was uploaded by someone else.
create or replace function public.can_write_scan_file(p_name text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_length(f, 1), 0) = 2
    and public.is_item_member(f[1])
    and not exists (
      select 1 from public.scans s
      where s.item_id = f[1]
        and s.id::text = lower(f[2])
        and s.created_by is distinct from (select auth.uid())::text
    )
  from (select storage.foldername(p_name) as f) path;
$$;

-- ---------------------------------------------------------------------------
-- Calls for the app and the website. Errors use PostgREST's PTxxx codes, so
-- the HTTP status says what went wrong: PT403 not allowed, 22023 bad input.
-- ---------------------------------------------------------------------------

-- The caller's relation to an item: 'owner', 'member', 'none' (the item
-- exists but belongs to others) or 'missing'.
create or replace function public.item_access(p_item_id text)
returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when not exists (select 1 from public.items i where i.id = p_item_id) then 'missing'
    else coalesce(
      (select m.role from public.item_members m where m.item_id = p_item_id and m.user_id = (select auth.uid())),
      'none'
    )
  end;
$$;

-- Before a baseline upload: creates the item with the caller as owner, or
-- returns the caller's role if they are already a member.
create or replace function public.claim_item(p_item_id text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  my_role text;
begin
  if uid is null then
    raise exception 'Sign in to scan items.' using errcode = 'PT403';
  end if;
  if p_item_id is null or p_item_id !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' then
    raise exception 'Item IDs use letters, numbers, - and _.' using errcode = '22023';
  end if;

  insert into public.items (id, owner_id) values (p_item_id, uid) on conflict (id) do nothing;
  if found then
    insert into public.item_members (item_id, user_id, role) values (p_item_id, uid, 'owner');
    return 'owner';
  end if;

  select m.role into my_role from public.item_members m where m.item_id = p_item_id and m.user_id = uid;
  if my_role is null then
    raise exception 'The item ID "%" is already used by another account.', p_item_id
      using errcode = 'PT403', hint = 'Pick a different item ID, or open the share link from the item''s owner.';
  end if;
  return my_role;
end;
$$;

-- Website listing: creates a new item named <slug>-NNN, with the next free
-- number, owned by the caller. Returns the id.
create or replace function public.create_item(p_slug text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  n bigint;
  candidate text;
begin
  if uid is null then
    raise exception 'Sign in to list items.' using errcode = 'PT403';
  end if;
  if p_slug is null or length(p_slug) > 60 or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'Use letters or numbers in the item name.' using errcode = '22023';
  end if;

  select coalesce(max(substring(i.id from '-([0-9]{1,9})$')::bigint), 0) into n
  from public.items i
  where i.id ~ ('^' || p_slug || '-[0-9]{1,9}$');

  -- Another listing can take the same number between the read and the insert: move on to the next.
  for attempt in 1..20 loop
    n := n + 1;
    candidate := p_slug || '-' || lpad(n::text, 3, '0');
    exit when length(candidate) > 64;
    insert into public.items (id, owner_id) values (candidate, uid) on conflict (id) do nothing;
    if found then
      insert into public.item_members (item_id, user_id, role) values (candidate, uid, 'owner');
      return candidate;
    end if;
  end loop;
  raise exception 'Could not assign an item ID for "%". Try a different name.', p_slug using errcode = '22023';
end;
$$;

-- Opening a share link: adds the caller as a member when the invite code
-- matches. Returns the caller's role; the owner stays owner.
create or replace function public.join_item(p_item_id text, p_invite_code text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Sign in to open shared items.' using errcode = 'PT403';
  end if;
  if not exists (select 1 from public.items i where i.id = p_item_id and i.invite_code = p_invite_code) then
    raise exception 'This share link is not valid for "%".', p_item_id
      using errcode = 'PT403', hint = 'Ask the item''s owner for a new link.';
  end if;
  insert into public.item_members (item_id, user_id, role)
  values (p_item_id, uid, 'member')
  on conflict (item_id, user_id) do nothing;
  return (select m.role from public.item_members m where m.item_id = p_item_id and m.user_id = uid);
end;
$$;

revoke all on function
  public.is_item_member(text), public.is_item_owner(text), public.can_write_scan_file(text),
  public.item_access(text), public.claim_item(text), public.create_item(text), public.join_item(text, text)
from public, anon;
grant execute on function
  public.is_item_member(text), public.is_item_owner(text), public.can_write_scan_file(text),
  public.item_access(text), public.claim_item(text), public.create_item(text), public.join_item(text, text)
to authenticated;

-- ---------------------------------------------------------------------------
-- Existing data
-- ---------------------------------------------------------------------------

-- Reserved: the engine's results folder in the scans bucket, and the website's
-- mock demo items. No owner and no members, so nobody can claim them.
insert into public.items (id) values ('diffs'), ('mug-001'), ('car-001')
on conflict (id) do nothing;

-- One item per scanned item id. Its owner is whoever uploaded its first
-- baseline while signed in; scans from before accounts have no owner.
insert into public.items (id, owner_id, created_at)
select s.item_id,
       (select u.id
          from public.scans b
          join auth.users u on u.id::text = b.created_by
         where b.item_id = s.item_id and b.kind = 'baseline'
         order by b.created_at
         limit 1),
       min(s.created_at)
from public.scans s
group by s.item_id
on conflict (id) do nothing;

insert into public.item_members (item_id, user_id, role, joined_at)
select i.id, i.owner_id, 'owner', i.created_at
from public.items i
where i.owner_id is not null
on conflict (item_id, user_id) do nothing;

-- Everyone else who uploaded a scan of an item, such as the buyer's check scan.
insert into public.item_members (item_id, user_id, role, joined_at)
select s.item_id, u.id, 'member', min(s.created_at)
from public.scans s
join auth.users u on u.id::text = s.created_by
group by s.item_id, u.id
on conflict (item_id, user_id) do nothing;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'scans_item_id_fkey') then
    alter table public.scans
      add constraint scans_item_id_fkey foreign key (item_id) references public.items (id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.scans enable row level security;
alter table public.items enable row level security;
alter table public.item_members enable row level security;

-- Earlier versions of this file, and a delete rule added by hand.
drop policy if exists "anon read scans" on public.scans;
drop policy if exists "anon insert scans" on public.scans;
drop policy if exists "anon update scans" on public.scans;
drop policy if exists "signed-in delete check scans" on public.scans;

drop policy if exists "members read scans" on public.scans;
drop policy if exists "members add scans" on public.scans;
drop policy if exists "members decide on check scans" on public.scans;
drop policy if exists "uploader or owner deletes check scans" on public.scans;
drop policy if exists "members read items" on public.items;
drop policy if exists "users read their memberships" on public.item_members;

create policy "members read scans" on public.scans
  for select to authenticated
  using (public.is_item_member(item_id));

-- Scans are added as the signed-in user, without a decision. Baselines only by the owner.
create policy "members add scans" on public.scans
  for insert to authenticated
  with check (
    created_by = (select auth.uid())::text
    and decision is null
    and public.is_item_member(item_id)
    and (kind = 'check' or public.is_item_owner(item_id))
  );

-- Only the decision column can change (see the grants below), and only on check scans.
create policy "members decide on check scans" on public.scans
  for update to authenticated
  using (kind = 'check' and public.is_item_member(item_id))
  with check (kind = 'check' and public.is_item_member(item_id));

-- The website's "Delete latest check-in", for redoing a check-in live. Never a baseline.
create policy "uploader or owner deletes check scans" on public.scans
  for delete to authenticated
  using (
    kind = 'check'
    and (created_by = (select auth.uid())::text or public.is_item_owner(item_id))
  );

create policy "members read items" on public.items
  for select to authenticated
  using (public.is_item_member(id));

create policy "users read their memberships" on public.item_members
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Items and memberships change only through claim_item, create_item and join_item.
revoke all on public.scans, public.items, public.item_members from anon;
revoke all on public.scans, public.items, public.item_members from authenticated;
grant select, insert, delete on public.scans to authenticated;
grant update (decision) on public.scans to authenticated;
grant select on public.items, public.item_members to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: the scans bucket, <item_id>/<scan_id>/<file>
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('scans', 'scans', true)
on conflict (id) do update set public = true;

drop policy if exists "anon read scan files" on storage.objects;
drop policy if exists "anon insert scan files" on storage.objects;
drop policy if exists "anon update scan files" on storage.objects;

drop policy if exists "members read scan files" on storage.objects;
drop policy if exists "members upload scan files" on storage.objects;
drop policy if exists "uploaders replace their scan files" on storage.objects;

create policy "members read scan files" on storage.objects
  for select to authenticated
  using (bucket_id = 'scans' and public.is_item_member((storage.foldername(name))[1]));

create policy "members upload scan files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'scans' and public.can_write_scan_file(name));

-- Uploads use upsert, so a retried upload replaces the uploader's own file. Nobody else's.
create policy "uploaders replace their scan files" on storage.objects
  for update to authenticated
  using (bucket_id = 'scans' and owner_id = (select auth.uid())::text and public.can_write_scan_file(name))
  with check (bucket_id = 'scans' and public.can_write_scan_file(name));

-- ---------------------------------------------------------------------------
-- Realtime: the web checkout and item pages subscribe to changes on scans.
-- Realtime applies the select policy above, so members only hear their items.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'scans'
  ) then
    alter publication supabase_realtime add table public.scans;
  end if;
end $$;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Optional: give the items scanned before accounts existed (created_by
-- "iPhone") to one account. Replace the email, then run this block on its own.
-- ---------------------------------------------------------------------------
--
-- do $$
-- declare
--   uid uuid := (select id from auth.users where email = 'you@example.com');
-- begin
--   if uid is null then raise exception 'No account with that email'; end if;
--   update public.items i set owner_id = uid
--    where i.owner_id is null
--      and i.id not in ('diffs', 'mug-001', 'car-001')
--      and i.id not like '\_%'
--      and not exists (select 1 from public.item_members m where m.item_id = i.id);
--   insert into public.item_members (item_id, user_id, role)
--   select i.id, uid, 'owner' from public.items i where i.owner_id = uid
--   on conflict (item_id, user_id) do update set role = 'owner';
-- end $$;
