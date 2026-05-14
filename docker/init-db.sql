-- BeloAuto — PostgreSQL schema initialisation
-- Creates one schema per bounded context within the single beloauto database.
-- Run automatically by docker-entrypoint-initdb.d on first container start.

CREATE SCHEMA IF NOT EXISTS platform;
CREATE SCHEMA IF NOT EXISTS customer;
CREATE SCHEMA IF NOT EXISTS staff;
CREATE SCHEMA IF NOT EXISTS booking;
CREATE SCHEMA IF NOT EXISTS loyalty;
CREATE SCHEMA IF NOT EXISTS notification;

-- Grant all privileges to the app user on each schema
GRANT ALL PRIVILEGES ON SCHEMA platform     TO beloauto;
GRANT ALL PRIVILEGES ON SCHEMA customer     TO beloauto;
GRANT ALL PRIVILEGES ON SCHEMA staff        TO beloauto;
GRANT ALL PRIVILEGES ON SCHEMA booking      TO beloauto;
GRANT ALL PRIVILEGES ON SCHEMA loyalty      TO beloauto;
GRANT ALL PRIVILEGES ON SCHEMA notification TO beloauto;
