DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='supabase_storage_admin') THEN CREATE ROLE supabase_storage_admin NOINHERIT LOGIN PASSWORD 'local-storage-only'; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS storage AUTHORIZATION supabase_storage_admin;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA storage TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA storage TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA storage TO anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_storage_admin IN SCHEMA storage GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_storage_admin IN SCHEMA storage GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_storage_admin IN SCHEMA storage GRANT SELECT ON TABLES TO anon, authenticated;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
GRANT anon, authenticated, service_role TO supabase_storage_admin;
GRANT USAGE ON SCHEMA public, extensions, auth TO supabase_storage_admin, service_role;
GRANT CREATE ON DATABASE inaura_dev TO supabase_storage_admin;
ALTER ROLE supabase_storage_admin SET search_path = storage, public, extensions;
