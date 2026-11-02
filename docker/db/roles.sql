-- Supabase's database image provisions these roles. Set their passwords to the
-- locally generated password, matching the official self-hosted roles.sql.
\getenv pgpass POSTGRES_PASSWORD
ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
