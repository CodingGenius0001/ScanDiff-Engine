-- Creates the confirmed demo account. Run in the Supabase SQL editor. Safe to re-run.
-- Login: demo@scandiff.dev / ScanDiffDemo!2026

do $$
declare
  demo_id uuid;
begin
  select id into demo_id from auth.users where email = 'demo@scandiff.dev';

  if demo_id is null then
    demo_id := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', demo_id, 'authenticated', 'authenticated',
      'demo@scandiff.dev', extensions.crypt('ScanDiffDemo!2026', extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Demo User"}',
      now(), now(),
      '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), demo_id, demo_id::text, 'email',
      jsonb_build_object('sub', demo_id::text, 'email', 'demo@scandiff.dev', 'email_verified', true),
      now(), now(), now()
    );
  end if;
end $$;
