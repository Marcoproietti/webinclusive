-- ─────────────────────────────────────────────────────────
-- WEB.INCLUSIVE — PostgreSQL Init Script
-- Crea schemi separati per dominio e utenti con privilegi minimi
-- Eseguito automaticamente al primo avvio del container
-- ─────────────────────────────────────────────────────────

-- Estensioni
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Revoca accesso pubblico di default
REVOKE ALL ON SCHEMA public FROM PUBLIC;

-- ── Schemi per dominio ────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS scheduling;
CREATE SCHEMA IF NOT EXISTS presenze;
CREATE SCHEMA IF NOT EXISTS cartella;
CREATE SCHEMA IF NOT EXISTS hr;
CREATE SCHEMA IF NOT EXISTS audit;

-- ── Utenti dedicati (principio minimo privilegio) ─────────

-- Auth Service
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'auth_user') THEN
    CREATE USER auth_user WITH PASSWORD 'CHANGE_IN_PRODUCTION';
  END IF;
END $$;
GRANT CONNECT ON DATABASE webinclusive TO auth_user;
GRANT USAGE, CREATE ON SCHEMA auth TO auth_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT ALL ON TABLES TO auth_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT ALL ON SEQUENCES TO auth_user;

-- Scheduling Service
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'sched_user') THEN
    CREATE USER sched_user WITH PASSWORD 'CHANGE_IN_PRODUCTION';
  END IF;
END $$;
GRANT CONNECT ON DATABASE webinclusive TO sched_user;
GRANT USAGE, CREATE ON SCHEMA scheduling TO sched_user;
-- scheduling può leggere da auth (operatori, beneficiari)
GRANT USAGE ON SCHEMA auth TO sched_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT SELECT ON TABLES TO sched_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA scheduling GRANT ALL ON TABLES TO sched_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA scheduling GRANT ALL ON SEQUENCES TO sched_user;

-- Presenze Service
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'pres_user') THEN
    CREATE USER pres_user WITH PASSWORD 'CHANGE_IN_PRODUCTION';
  END IF;
END $$;
GRANT CONNECT ON DATABASE webinclusive TO pres_user;
GRANT USAGE, CREATE ON SCHEMA presenze TO pres_user;
GRANT USAGE ON SCHEMA auth TO pres_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth    GRANT SELECT ON TABLES TO pres_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA presenze GRANT ALL   ON TABLES TO pres_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA presenze GRANT ALL   ON SEQUENCES TO pres_user;

-- Cartella Service
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'cartella_user') THEN
    CREATE USER cartella_user WITH PASSWORD 'CHANGE_IN_PRODUCTION';
  END IF;
END $$;
GRANT CONNECT ON DATABASE webinclusive TO cartella_user;
GRANT USAGE, CREATE ON SCHEMA cartella TO cartella_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA cartella GRANT ALL ON TABLES TO cartella_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA cartella GRANT ALL ON SEQUENCES TO cartella_user;

-- HR Service
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'hr_user') THEN
    CREATE USER hr_user WITH PASSWORD 'CHANGE_IN_PRODUCTION';
  END IF;
END $$;
GRANT CONNECT ON DATABASE webinclusive TO hr_user;
GRANT USAGE, CREATE ON SCHEMA hr TO hr_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA hr GRANT ALL ON TABLES TO hr_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA hr GRANT ALL ON SEQUENCES TO hr_user;

-- Audit (solo INSERT — append-only)
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'audit_user') THEN
    CREATE USER audit_user WITH PASSWORD 'CHANGE_IN_PRODUCTION';
  END IF;
END $$;
GRANT CONNECT ON DATABASE webinclusive TO audit_user;
GRANT USAGE ON SCHEMA audit TO audit_user;
GRANT CREATE ON SCHEMA audit TO audit_user;
-- No UPDATE, no DELETE — append-only enforced a livello applicativo

-- ── Indici per performance query frequenti ────────────────
-- (creati dopo le migrations Prisma con CONCURRENTLY)

-- Nota: questi indici vengono creati da Prisma migrate.
-- Qui aggiungiamo solo indici supplementari di ottimizzazione.

-- ── Configurazione sicurezza PostgreSQL ───────────────────

-- Forza SSL per tutte le connessioni remote (tranne localhost)
-- ALTER SYSTEM SET ssl = on;  -- abilitare in produzione con certs

-- Log query lente (> 1 secondo)
ALTER SYSTEM SET log_min_duration_statement = 1000;
ALTER SYSTEM SET log_checkpoints = on;
ALTER SYSTEM SET log_connections = on;
ALTER SYSTEM SET log_disconnections = on;
ALTER SYSTEM SET log_lock_waits = on;

SELECT pg_reload_conf();
