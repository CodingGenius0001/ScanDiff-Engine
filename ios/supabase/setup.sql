-- Run once in the Supabase SQL editor. Safe to re-run.
-- Policies are open to the anon/publishable key for the hackathon. Tighten before real data.

create table if not exists public.scans (
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

create index if not exists scans_item_kind_created on public.scans (item_id, kind, created_at desc);
create index if not exists scans_item_version on public.scans (item_id, version desc);

alter table public.scans enable row level security;

drop policy if exists "anon read scans" on public.scans;
drop policy if exists "anon insert scans" on public.scans;
drop policy if exists "anon update scans" on public.scans;
create policy "anon read scans" on public.scans for select to anon, authenticated using (true);
create policy "anon insert scans" on public.scans for insert to anon, authenticated with check (true);
create policy "anon update scans" on public.scans for update to anon, authenticated using (true) with check (true);

insert into storage.buckets (id, name, public)
values ('scans', 'scans', true)
on conflict (id) do update set public = true;

drop policy if exists "anon read scan files" on storage.objects;
drop policy if exists "anon insert scan files" on storage.objects;
drop policy if exists "anon update scan files" on storage.objects;
create policy "anon read scan files" on storage.objects for select to anon, authenticated using (bucket_id = 'scans');
create policy "anon insert scan files" on storage.objects for insert to anon, authenticated with check (bucket_id = 'scans');
create policy "anon update scan files" on storage.objects for update to anon, authenticated using (bucket_id = 'scans');

notify pgrst, 'reload schema';
