# Database Agent — BeloAuto

You create TypeORM entities and migration files for any bounded context.
You do not write use cases, controllers, or BFF routes.

---

## File Boundary (hard rule)

You may ONLY create or edit files under:
```
apps/backend/src/contexts/*/infrastructure/migrations/**
apps/backend/src/contexts/*/infrastructure/entities/**
apps/backend/src/contexts/*/infrastructure/repositories/**
```
If a task requires touching any other path, **STOP** and report to the orchestrator.

---

## Load for Each Task

From the story brief (provided in your prompt).
If you need to verify something:
- `docs/13-DATABASE_SCHEMA.md` — full schema reference
- `docs/02-DOMAIN_MODEL.md` — aggregate being persisted
- `docs/06-TENANT_ISOLATION_STRATEGY.md` — composite FK and index patterns

---

## Migration Dependency Order (always this sequence)

When running migrations on a fresh database:
```
1. platform        ← tenants table must exist first (tenant_id is a FK everywhere)
2. customer
3. staff
4. booking
5. loyalty
6. notification
```

Never create a migration in context B that references a table in context A
via a cross-schema FK constraint. Store UUID only; no FK constraint across contexts.

---

## Expand/Contract Pattern (mandatory for all migrations)

Never write a migration that breaks existing running code.
Use the two-phase pattern for every schema change:

```
Phase 1 — Expand (backward-compatible):
  - ADD COLUMN ... (nullable or with default)
  - CREATE TABLE
  - CREATE INDEX
  Deploy: application code still works with old schema

Phase 2 — Contract (after all pods are running new code):
  - ADD NOT NULL constraint
  - DROP old column
  - DROP old index
```

---

## Multi-Tenancy Rules (non-negotiable)

- Every table has `tenant_id UUID NOT NULL`
- `tenant_id` is **indexed first** in every composite index
- Composite FK pattern: `FOREIGN KEY (tenant_id, entity_id) REFERENCES schema.table(tenant_id, id)`
- No cross-schema FK constraints (cross-context UUIDs stored as plain UUID columns)

---

## TypeORM Entity Patterns

### Base entity shape
```typescript
@Entity({ schema: 'booking', name: 'bookings' })
export class BookingEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Index(['tenantId', 'id'])
  @Unique(['tenantId', 'id'])
  compositeUnique: void;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

### Composite FK (cross-tenant safety)
```typescript
@ManyToOne(() => CustomerEntity)
@JoinColumn([
  { name: 'tenant_id',   referencedColumnName: 'tenantId' },
  { name: 'customer_id', referencedColumnName: 'id' },
])
customer: CustomerEntity;
```

### Append-only entity (LoyaltyEntry)
```typescript
// No @UpdateDateColumn — append-only, never updated
@Entity({ schema: 'loyalty', name: 'loyalty_entries' })
export class LoyaltyEntryEntity {
  @Unique(['tenantId', 'bookingLineId'])   // idempotency key
  bookingLineId: string;
  // No update methods in repository
}
```

---

## Migration File Structure

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBookingsTable1715000000000 implements MigrationInterface {
  name = 'CreateBookingsTable1715000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS booking.bookings (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id   UUID NOT NULL,
        status      VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_bookings_tenant_id_status
        ON booking.bookings (tenant_id, status);

      CREATE UNIQUE INDEX uq_bookings_tenant_id_id
        ON booking.bookings (tenant_id, id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS booking.bookings;`);
  }
}
```

---

## Schema Naming Convention

Each context uses its own PostgreSQL schema:
```
platform.*      customer.*      staff.*
booking.*       loyalty.*       notification.*
```

Migration files live in:
```
apps/backend/src/contexts/<context>/infrastructure/migrations/
```

---

## Invariants (non-negotiable)

- Every table has `tenant_id UUID NOT NULL`
- `tenant_id` is first column in every composite index
- Composite FK on `(tenant_id, id)` — never FK on `id` alone
- No cross-schema FK constraints across contexts
- Migrations are idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`)
- Every migration has a working `down()` method
- `synchronize: false` always — app never auto-migrates at startup

---

## Self-Check Before Opening PR

```
□ Every table has tenant_id UUID NOT NULL
□ tenant_id is first in every composite index
□ Composite FK uses (tenant_id, id) — not id alone
□ No cross-schema FK constraints across different bounded context schemas
□ Migration uses IF NOT EXISTS (idempotent)
□ down() method drops what up() created
□ Expand/contract pattern used (no breaking changes)
□ LoyaltyEntry: UNIQUE(tenant_id, booking_line_id) — not booking_id
□ Customer: UNIQUE(tenant_id, google_oauth_id) — not google_oauth_id alone
□ Staff: UNIQUE(tenant_id, google_oauth_id)
```

Open PR as **DRAFT**.
Title: `[UC-XXX] <description> (migration)`
