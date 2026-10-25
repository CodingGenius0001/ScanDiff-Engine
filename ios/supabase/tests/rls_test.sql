-- Checks setup.sql's access rules, run by run.sh after legacy_data.sql and
-- setup.sql. Each block acts as one user; any failed assert stops the run.
--
--   seller   11111111-…  owns charger-002 (signed-in baseline before the upgrade)
--   buyer    22222222-…  member of charger-002 (signed-in check scan)
--   stranger 33333333-…  no items

create schema t;
grant usage on schema t to anon, authenticated;

-- Act as a Supabase API role, signed in as `uid` (or signed out).
create procedure t.login(p_role text, p_uid text default null)
language plpgsql
as $$
begin
  perform set_config('role', p_role, false);
  perform set_config('request.jwt.claim.sub', coalesce(p_uid, ''), false);
end
$$;

-- Fails unless running `p_sql` raises SQLSTATE `p_code`.
create function t.expect_error(p_sql text, p_code text) returns void
language plpgsql
as $$
declare
  got text;
begin
  begin
    execute p_sql;
  exception when others then
    got := sqlstate;
  end;
  if got is distinct from p_code then
    raise exception 'expected SQLSTATE % but got % from: %', p_code, coalesce(got, 'success'), p_sql;
  end if;
end
$$;

-- Rows changed by `p_sql`.
create function t.changed(p_sql text) returns bigint
language plpgsql
as $$
declare
  n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end
$$;

grant execute on all functions in schema t to anon, authenticated;
grant execute on all procedures in schema t to anon, authenticated;

-- ---------------------------------------------------------------------------
\echo 'backfill'
do $$
begin
  assert (select owner_id from public.items where id = 'charger-002') = '11111111-1111-1111-1111-111111111111', 'seller owns charger-002';
  assert (select role from public.item_members where item_id = 'charger-002' and user_id = '11111111-1111-1111-1111-111111111111') = 'owner', 'seller is owner member';
  assert (select role from public.item_members where item_id = 'charger-002' and user_id = '22222222-2222-2222-2222-222222222222') = 'member', 'buyer is member';
  assert (select owner_id from public.items where id = 'charger-1') is null, 'pre-account item has no owner';
  assert not exists (select 1 from public.item_members where item_id in ('charger-1', '_smoke', 'diffs', 'mug-001')), 'orphans and reserved ids have no members';
  assert (select count(*) from public.items) = 6, 'one item per scanned id plus three reserved';
  assert (select count(*) from public.item_members) = 2, 'second run of setup.sql added nothing';
  assert (select length(invite_code) from public.items where id = 'charger-002') = 24, 'invite code is 96 bits of hex';
end $$;

-- ---------------------------------------------------------------------------
\echo 'signed out sees nothing'
call t.login('anon');
select t.expect_error('select * from public.scans', '42501');
select t.expect_error('select * from public.items', '42501');
select t.expect_error($q$select public.claim_item('anon-item')$q$, '42501');
select t.expect_error($q$select public.item_access('charger-002')$q$, '42501');
do $$
begin
  assert (select count(*) from storage.objects) = 0, 'anon lists no files';
end $$;

-- ---------------------------------------------------------------------------
\echo 'stranger sees nothing and cannot take or write to other items'
call t.login('authenticated', '33333333-3333-3333-3333-333333333333');
do $$
begin
  assert (select count(*) from public.scans) = 0, 'stranger reads no scans';
  assert (select count(*) from public.items) = 0, 'stranger reads no items';
  assert (select count(*) from storage.objects) = 0, 'stranger lists no files';
  assert public.item_access('charger-002') = 'none', 'access: none';
  assert public.item_access('never-scanned') = 'missing', 'access: missing';
  assert t.changed($q$update public.scans set decision = 'accept' where id = 'bbbbbbbb-0000-0000-0000-000000000002'$q$) = 0, 'stranger cannot decide';
  assert t.changed($q$delete from public.scans where id = 'bbbbbbbb-0000-0000-0000-000000000002'$q$) = 0, 'stranger cannot delete';
end $$;
select t.expect_error($q$select public.claim_item('charger-002')$q$, 'PT403');
select t.expect_error($q$select public.claim_item('charger-1')$q$, 'PT403');
select t.expect_error($q$select public.claim_item('diffs')$q$, 'PT403');
select t.expect_error($q$select public.claim_item('mug-001')$q$, 'PT403');
select t.expect_error($q$select public.claim_item('_setup')$q$, '22023');
select t.expect_error($q$select public.claim_item('bad/id')$q$, '22023');
select t.expect_error($q$
  insert into public.scans (id, item_id, version, kind, created_by)
  values ('eeeeeeee-0000-0000-0000-000000000001', 'charger-002', 3, 'check', '33333333-3333-3333-3333-333333333333')$q$, '42501');
select t.expect_error($q$
  insert into storage.objects (bucket_id, name) values ('scans', 'charger-002/EEEE/photo.jpg')$q$, '42501');
select t.expect_error($q$
  insert into storage.objects (bucket_id, name) values ('scans', 'diffs/x/heatmap.glb')$q$, '42501');
select t.expect_error($q$select public.join_item('charger-002', 'wrong-code')$q$, 'PT403');

-- ---------------------------------------------------------------------------
\echo 'stranger claims a new item and uploads a baseline'
do $$
begin
  assert public.claim_item('desk-lamp') = 'owner', 'claim creates the item';
  assert public.claim_item('desk-lamp') = 'owner', 'claim again is a no-op';
  insert into public.scans (id, item_id, version, kind, created_by)
  values ('eeeeeeee-0000-0000-0000-000000000010', 'desk-lamp', 1, 'baseline', '33333333-3333-3333-3333-333333333333');
  insert into storage.objects (bucket_id, name) values ('scans', 'desk-lamp/EEEEEEEE-0000-0000-0000-000000000010/model.usdz');
  -- A retried upload (upsert) replaces the uploader's own file.
  assert t.changed($q$update storage.objects set name = name where name = 'desk-lamp/EEEEEEEE-0000-0000-0000-000000000010/model.usdz'$q$) = 1, 'upsert own file';
  assert (select count(*) from public.scans) = 1, 'stranger now reads their own item';
  assert (select count(*) from storage.objects) = 1, 'and lists its files';
end $$;
-- Not as somebody else, not with a decision, not outside <item>/<scan>/<file>.
select t.expect_error($q$
  insert into public.scans (id, item_id, version, kind, created_by)
  values ('eeeeeeee-0000-0000-0000-000000000011', 'desk-lamp', 2, 'baseline', '11111111-1111-1111-1111-111111111111')$q$, '42501');
select t.expect_error($q$
  insert into public.scans (id, item_id, version, kind, created_by, decision)
  values ('eeeeeeee-0000-0000-0000-000000000012', 'desk-lamp', 2, 'check', '33333333-3333-3333-3333-333333333333', 'accept')$q$, '42501');
select t.expect_error($q$
  insert into storage.objects (bucket_id, name) values ('scans', 'desk-lamp/model.usdz')$q$, '42501');
-- created_by defaults to the signed-in user.
do $$
begin
  insert into public.scans (id, item_id, version, kind)
  values ('eeeeeeee-0000-0000-0000-000000000013', 'desk-lamp', 2, 'baseline');
  assert (select created_by from public.scans where id = 'eeeeeeee-0000-0000-0000-000000000013') = '33333333-3333-3333-3333-333333333333', 'created_by default';
end $$;

-- ---------------------------------------------------------------------------
\echo 'buyer reads the shared item, adds check scans, decides'
call t.login('authenticated', '22222222-2222-2222-2222-222222222222');
do $$
begin
  assert (select count(*) from public.scans) = 2, 'buyer reads both charger-002 scans';
  assert (select count(*) from public.scans where item_id <> 'charger-002') = 0, 'and nothing else';
  assert (select count(*) from public.items) = 1, 'buyer reads one item';
  assert (select count(*) from public.item_members) = 1, 'buyer reads only their own membership';
  assert (select count(*) from storage.objects) = 1, 'buyer lists the seller''s baseline file';
  assert public.item_access('charger-002') = 'member', 'access: member';
  assert public.claim_item('charger-002') = 'member', 'claim by a member returns the role';
  assert t.changed($q$update public.scans set decision = 'dispute' where id = 'bbbbbbbb-0000-0000-0000-000000000002'$q$) = 1, 'buyer decides on the check scan';
  assert t.changed($q$update public.scans set decision = 'accept' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$q$) = 0, 'no decision on a baseline';
  insert into public.scans (id, item_id, version, kind, created_by)
  values ('bbbbbbbb-0000-0000-0000-000000000003', 'charger-002', 3, 'check', '22222222-2222-2222-2222-222222222222');
  insert into storage.objects (bucket_id, name) values ('scans', 'charger-002/BBBBBBBB-0000-0000-0000-000000000003/model.usdz');
end $$;
-- Only the decision column can change, and only the owner adds baselines.
select t.expect_error($q$update public.scans set version = 9 where id = 'bbbbbbbb-0000-0000-0000-000000000002'$q$, '42501');
select t.expect_error($q$update public.scans set item_id = 'desk-lamp' where id = 'bbbbbbbb-0000-0000-0000-000000000002'$q$, '42501');
select t.expect_error($q$
  insert into public.scans (id, item_id, version, kind, created_by)
  values ('bbbbbbbb-0000-0000-0000-000000000004', 'charger-002', 4, 'baseline', '22222222-2222-2222-2222-222222222222')$q$, '42501');
-- Tampering with the seller's scan files: no new files in their folder, no overwrites.
select t.expect_error($q$
  insert into storage.objects (bucket_id, name) values ('scans', 'charger-002/AAAAAAAA-0000-0000-0000-000000000001/photo_99.jpg')$q$, '42501');
do $$
begin
  assert t.changed($q$update storage.objects set owner_id = owner_id where name like 'charger-002/AAAAAAAA%'$q$) = 0, 'cannot overwrite the seller''s file';
end $$;

-- ---------------------------------------------------------------------------
\echo 'share link: stranger joins charger-002'
reset role;
select set_config('t.code', (select invite_code from public.items where id = 'charger-002'), false);
call t.login('authenticated', '33333333-3333-3333-3333-333333333333');
do $$
begin
  assert public.join_item('charger-002', current_setting('t.code')) = 'member', 'join with the code';
  assert public.join_item('charger-002', current_setting('t.code')) = 'member', 'joining twice is a no-op';
  assert (select count(*) from public.scans where item_id = 'charger-002') = 3, 'new member reads the item';
  assert (select invite_code from public.items where id = 'charger-002') = current_setting('t.code'), 'members read the invite code';
  assert t.changed($q$delete from public.scans where id = 'bbbbbbbb-0000-0000-0000-000000000003'$q$) = 0, 'cannot delete someone else''s check scan';
end $$;

-- ---------------------------------------------------------------------------
\echo 'seller: listing ids, deleting check scans, owner joins own link'
call t.login('authenticated', '11111111-1111-1111-1111-111111111111');
do $$
begin
  assert public.create_item('mug') = 'mug-002', 'mug-001 is reserved for the demo';
  assert public.create_item('mug') = 'mug-003', 'next number';
  assert public.create_item('charger') = 'charger-003', 'after charger-1 and charger-002';
  assert public.item_access('mug-002') = 'owner', 'listing makes the seller owner';
  assert public.join_item('charger-002', current_setting('t.code')) = 'owner', 'owner stays owner';
  assert t.changed($q$delete from public.scans where id = 'bbbbbbbb-0000-0000-0000-000000000003'$q$) = 1, 'owner deletes a check scan';
  assert t.changed($q$delete from public.scans where id = 'aaaaaaaa-0000-0000-0000-000000000001'$q$) = 0, 'nobody deletes a baseline';
end $$;
select t.expect_error($q$select public.create_item('Bad Name')$q$, '22023');
select t.expect_error($q$select public.create_item('')$q$, '22023');
select t.expect_error($q$insert into public.items (id) values ('direct-insert')$q$, '42501');
select t.expect_error($q$insert into public.item_members (item_id, user_id, role) values ('charger-1', '11111111-1111-1111-1111-111111111111', 'owner')$q$, '42501');

reset role;
\echo 'All RLS tests passed.'
