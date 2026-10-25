-- A database as the earlier, open setup.sql left it: the scans table with
-- full anon access, and rows from before and after accounts existed.

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'seller@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'buyer@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'stranger@example.com');

create table public.scans (
  id uuid primary key,
  item_id text not null,
  version int not null,
  kind text not null check (kind in ('baseline', 'check')),
  model_url text,
  sha256 text,
  created_by text,
  created_at timestamptz not null default now(),
  decision text check (decision in ('accept', 'dispute'))
);
alter table public.scans enable row level security;
create policy "anon read scans" on public.scans for select to anon, authenticated using (true);
create policy "anon insert scans" on public.scans for insert to anon, authenticated with check (true);
create policy "anon update scans" on public.scans for update to anon, authenticated using (true) with check (true);
create policy "signed-in delete check scans" on public.scans for delete to authenticated using (kind = 'check');
grant all on public.scans to anon, authenticated;

insert into public.scans (id, item_id, version, kind, created_by, created_at) values
  -- Seller's baseline and buyer's check scan, both signed in.
  ('aaaaaaaa-0000-0000-0000-000000000001', 'charger-002', 1, 'baseline', '11111111-1111-1111-1111-111111111111', '2026-10-25 03:53:21+00'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'charger-002', 2, 'check', '22222222-2222-2222-2222-222222222222', '2026-10-25 04:27:30+00'),
  -- From before accounts.
  ('cccccccc-0000-0000-0000-000000000003', 'charger-1', 1, 'baseline', 'iPhone', '2026-10-24 21:04:48+00'),
  ('cccccccc-0000-0000-0000-000000000004', 'charger-1', 2, 'check', 'iPhone', '2026-10-24 22:50:16+00'),
  ('dddddddd-0000-0000-0000-000000000005', '_smoke', 1, 'baseline', 'setup check', '2026-10-24 17:46:59+00');

insert into storage.buckets (id, name, public) values ('scans', 'scans', true);
insert into storage.objects (bucket_id, name, owner_id) values
  ('scans', 'charger-002/AAAAAAAA-0000-0000-0000-000000000001/model.usdz', '11111111-1111-1111-1111-111111111111'),
  ('scans', 'diffs/some-diff/heatmap.glb', null);
