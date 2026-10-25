-- The parts of a Supabase database that setup.sql relies on, for testing it
-- on a plain local Postgres: the API roles, auth.users and auth.uid(),
-- pgcrypto in the extensions schema, storage.buckets and storage.objects, and
-- the realtime publication.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (
  id uuid primary key,
  email text unique
);

-- Supabase reads the user id from the request's JWT; tests set it directly.
create function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create schema extensions;
create extension pgcrypto schema extensions;

create schema storage;
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false
);
create table storage.objects (
  id uuid primary key default extensions.gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner_id text default (auth.uid()::text),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;

-- Same definition as Supabase's.
create function storage.foldername(name text) returns text[]
language plpgsql immutable
as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1 : array_length(_parts, 1) - 1];
end
$$;

create publication supabase_realtime;

grant usage on schema public, auth, extensions, storage to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated;
grant select, insert, update, delete on storage.objects to anon, authenticated;
grant select on storage.buckets to anon, authenticated;
