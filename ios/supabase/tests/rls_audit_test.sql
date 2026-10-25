-- More hostile-input checks of setup.sql, run by run.sh after rls_test.sql
-- (reuses its t.* helpers and the state it leaves). Asserts what must hold;
-- the "probe" section at the end only prints what the rules allow today.

-- ---------------------------------------------------------------------------
\echo 'audit: signed out cannot call any item function'
call t.login('anon');
select t.expect_error($q$select public.create_item('mug')$q$, '42501');
select t.expect_error($q$select public.join_item('charger-002', 'x')$q$, '42501');
select t.expect_error($q$select public.is_item_member('charger-002')$q$, '42501');
select t.expect_error($q$update public.scans set decision = 'accept'$q$, '42501');
select t.expect_error($q$delete from public.scans$q$, '42501');
select t.expect_error($q$insert into storage.objects (bucket_id, name) values ('scans', 'charger-002/X/model.usdz')$q$, '42501');

-- ---------------------------------------------------------------------------
\echo 'audit: item ids and slugs are validated, including regex and path characters'
call t.login('authenticated', '33333333-3333-3333-3333-333333333333');
select t.expect_error($q$select public.claim_item('../charger-002')$q$, '22023');
select t.expect_error($q$select public.claim_item('a/b')$q$, '22023');
select t.expect_error($q$select public.claim_item('')$q$, '22023');
select t.expect_error($q$select public.claim_item(null)$q$, '22023');
select t.expect_error($q$select public.claim_item(repeat('a', 65))$q$, '22023');
select t.expect_error($q$select public.claim_item('mug 2')$q$, '22023');
select t.expect_error($q$select public.claim_item('mug''; drop table public.scans; --')$q$, '22023');
select t.expect_error($q$select public.create_item('mug.*')$q$, '22023');
select t.expect_error($q$select public.create_item('a|b')$q$, '22023');
select t.expect_error($q$select public.create_item(repeat('a', 61))$q$, '22023');
select t.expect_error($q$select public.join_item('charger-002', null)$q$, 'PT403');
select t.expect_error($q$select public.join_item('charger-002', '')$q$, 'PT403');
do $$
begin
  assert public.claim_item(repeat('a', 64)) = 'owner', 'a 64-character id is allowed';
  assert (select count(*) from public.scans where item_id = 'charger-002') > 0, 'stranger joined charger-002 in rls_test.sql';
end $$;

-- ---------------------------------------------------------------------------
\echo 'audit: members change only the decision, and only to accept or dispute'
call t.login('authenticated', '22222222-2222-2222-2222-222222222222');
select t.expect_error($q$update public.scans set decision = 'accepted' where id = 'bbbbbbbb-0000-0000-0000-000000000002'$q$, '23514');
select t.expect_error($q$update public.scans set sha256 = 'f00' where id = 'bbbbbbbb-0000-0000-0000-000000000002'$q$, '42501');
select t.expect_error($q$update public.scans set model_url = 'https://evil' where id = 'bbbbbbbb-0000-0000-0000-000000000002'$q$, '42501');
select t.expect_error($q$update public.scans set created_by = '22222222-2222-2222-2222-222222222222' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$q$, '42501');
select t.expect_error($q$update public.scans set kind = 'check' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$q$, '42501');
select t.expect_error($q$update public.items set invite_code = 'mine' where id = 'charger-002'$q$, '42501');
select t.expect_error($q$
  insert into public.scans (id, item_id, version, kind) values ('eeeeeeee-0000-0000-0000-000000000099', 'desk-lamp', 9, 'check')$q$, '42501');
do $$
begin
  assert (select count(*) from public.items where id = 'desk-lamp') = 0, 'a member of one item cannot read another''s invite code';
end $$;

-- ---------------------------------------------------------------------------
\echo 'audit: storage paths cannot hop into another item'
select t.expect_error($q$insert into storage.objects (bucket_id, name) values ('scans', 'charger-002/../desk-lamp/x.jpg')$q$, '42501');
select t.expect_error($q$insert into storage.objects (bucket_id, name) values ('scans', 'desk-lamp/EEEEEEEE-0000-0000-0000-000000000010/x.jpg')$q$, '42501');
select t.expect_error($q$insert into storage.objects (bucket_id, name) values ('other-bucket', 'charger-002/X/x.jpg')$q$, '42501');

-- ---------------------------------------------------------------------------
\echo 'audit: realtime publishes scans'
reset role;
do $$
begin
  assert exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'scans'), 'scans in supabase_realtime';
  assert (select count(*) from pg_constraint where conrelid = 'public.scans'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%accept%dispute%') = 1, 'one decision check constraint';
end $$;

-- ---------------------------------------------------------------------------
-- Probes: what the rules allow today (AUD-12 in AGGREGATE_REPORT.md). Printed, not asserted.
\echo 'probe: who may write decision on the buyer''s check scan bbbbbbbb-…-0002'
call t.login('authenticated', '11111111-1111-1111-1111-111111111111');
select 'seller (owner) sets accept' as probe,
       t.changed($q$update public.scans set decision = 'accept' where id = 'bbbbbbbb-0000-0000-0000-000000000002'$q$) as rows_changed;
call t.login('authenticated', '22222222-2222-2222-2222-222222222222');
select 'buyer flips accept to dispute' as probe,
       t.changed($q$update public.scans set decision = 'dispute' where id = 'bbbbbbbb-0000-0000-0000-000000000002'$q$) as rows_changed;
select 'buyer clears the decision' as probe,
       t.changed($q$update public.scans set decision = null where id = 'bbbbbbbb-0000-0000-0000-000000000002'$q$) as rows_changed;
call t.login('authenticated', '33333333-3333-3333-3333-333333333333');
select 'member who joined by link (not the uploader) sets accept' as probe,
       t.changed($q$update public.scans set decision = 'accept' where id = 'bbbbbbbb-0000-0000-0000-000000000002'$q$) as rows_changed;
call t.login('authenticated', '22222222-2222-2222-2222-222222222222');
select 'buyer writes storage name with .. as scan folder' as probe,
       t.changed($q$insert into storage.objects (bucket_id, name) values ('scans', 'charger-002/../x.jpg')$q$) as rows_changed;

reset role;
\echo 'All audit RLS checks passed.'
