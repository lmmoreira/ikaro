#!/bin/bash
# Provisions the two PostgreSQL roles used by Ikaro.
# Run once before the first migration — on a blank database.
#
#   docker-compose : mounted in initdb.d — runs automatically on first container start.
#   Tests          : integration-global-setup.ts issues equivalent SQL via process.env.
#   Production/CI  : execute this script (or the equivalent SQL) as step 1 before pnpm db:migrate.
#
# Required env vars (falls back to safe local-dev defaults if not set):
#   DB_MIGRATOR_PASSWORD  — password for the migration role (DDL access)
#   DB_APP_PASSWORD       — password for the app runtime role (DML only)

set -e

MIGRATOR_PASSWORD="${DB_MIGRATOR_PASSWORD:-ikaro_migrator}"
APP_PASSWORD="${DB_APP_PASSWORD:-ikaro_app}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-SQL
  -- Migration role: CREATE/ALTER/DROP tables and schemas
  DO \$\$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'ikaro_migrator') THEN
      CREATE USER ikaro_migrator WITH PASSWORD '${MIGRATOR_PASSWORD}';
    END IF;
  END \$\$;

  -- App runtime role: SELECT/INSERT/UPDATE/DELETE only
  DO \$\$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'ikaro_app') THEN
      CREATE USER ikaro_app WITH PASSWORD '${APP_PASSWORD}';
    END IF;
  END \$\$;

  -- Allow the migrator to create schemas in this database
  DO \$\$ BEGIN
    EXECUTE format('GRANT CREATE ON DATABASE %I TO ikaro_migrator', current_database());
  END \$\$;

  -- PostgreSQL 15+ revokes CREATE on public schema by default — restore it for our roles
  GRANT CREATE ON SCHEMA public TO ikaro_migrator;
  GRANT USAGE  ON SCHEMA public TO ikaro_migrator, ikaro_app;
SQL
