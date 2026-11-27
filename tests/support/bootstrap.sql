CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE supabase_auth_admin LOGIN PASSWORD 'local-auth-only';
CREATE SCHEMA auth AUTHORIZATION supabase_auth_admin;
ALTER ROLE supabase_auth_admin SET search_path = auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
