import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';

config();

// ── Fixed UUIDs ensure idempotency across multiple runs ──────────────────────
const IDS = {
  tenantA: '00000000-0000-7000-8000-000000000001',
  tenantB: '00000000-0000-7000-8000-000000000002',

  staffAdminA: '00000000-0000-7000-8001-000000000001',
  staffWorkerA: '00000000-0000-7000-8001-000000000002',
  staffAdminB: '00000000-0000-7000-8001-000000000003',

  customerA1: '00000000-0000-7000-8002-000000000001', // cliente@ in tenant A
  customerA2: '00000000-0000-7000-8002-000000000002', // cliente@ in tenant B

  serviceSimples: '00000000-0000-7000-8003-000000000001',
  serviceCompleta: '00000000-0000-7000-8003-000000000002',
  servicePolimento: '00000000-0000-7000-8003-000000000003',
  serviceHigienizacao: '00000000-0000-7000-8003-000000000004',

  hotsiteA: '00000000-0000-7000-8004-000000000001',
  hotsiteB: '00000000-0000-7000-8004-000000000002',

  bookingPending: '00000000-0000-7000-8005-000000000001',
  bookingApproved: '00000000-0000-7000-8005-000000000002',
  bookingCompleted: '00000000-0000-7000-8005-000000000003',

  lineCompleted: '00000000-0000-7000-8006-000000000001',
  loyaltyEntry: '00000000-0000-7000-8007-000000000001',
};

const TENANT_SETTINGS = {
  timezone: 'America/Sao_Paulo',
  booking: { cancellationWindowHours: 48, maxAdvanceBookingDays: 30 },
  loyalty: { expiryDays: 180 },
  businessHours: {
    monday: { open: '08:00', close: '18:00', closed: false },
    tuesday: { open: '08:00', close: '18:00', closed: false },
    wednesday: { open: '08:00', close: '18:00', closed: false },
    thursday: { open: '08:00', close: '18:00', closed: false },
    friday: { open: '08:00', close: '18:00', closed: false },
    saturday: { open: '08:00', close: '18:00', closed: false },
    sunday: { open: '00:00', close: '00:00', closed: true },
  },
};

async function seed(): Promise<void> {
  if (!process.env['DATABASE_URL']) throw new Error('DATABASE_URL is required');

  const ds = new DataSource({
    type: 'postgres',
    url: process.env['DATABASE_URL'],
    synchronize: false,
    migrationsRun: false,
  });

  await ds.initialize();
  const q = ds.createQueryRunner();
  await q.connect();
  await q.startTransaction();

  try {
    await createSchema(q);

    const alreadySeeded = (await q.query(
      `SELECT EXISTS(SELECT 1 FROM platform.tenants WHERE id = $1) AS exists`,
      [IDS.tenantA],
    )) as Array<{ exists: boolean }>;

    if (alreadySeeded[0]?.exists) {
      process.stdout.write('✓ Database already seeded — skipping.\n');
      await q.rollbackTransaction();
      return; // finally block handles release + destroy
    }

    await seedTenants(q);
    await seedStaff(q);
    await seedCustomers(q);
    await seedServices(q);
    await seedHotsites(q);
    await seedBookings(q);

    await q.commitTransaction();
    printSummary();
  } catch (err) {
    await q.rollbackTransaction();
    throw err;
  } finally {
    await q.release();
    await ds.destroy();
  }
}

// ── Schema (CREATE TABLE IF NOT EXISTS — safe to run with or without migrations) ─

async function createSchema(q: ReturnType<DataSource['createQueryRunner']>): Promise<void> {
  await q.query(`
    CREATE TABLE IF NOT EXISTS platform.tenants (
      id          UUID PRIMARY KEY,
      slug        TEXT NOT NULL UNIQUE,
      name        TEXT NOT NULL,
      settings    JSONB NOT NULL DEFAULT '{}',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await q.query(`
    CREATE TABLE IF NOT EXISTS platform.hotsite_configs (
      id              UUID PRIMARY KEY,
      tenant_id       UUID NOT NULL REFERENCES platform.tenants(id),
      tenant_slug     TEXT NOT NULL,
      tenant_name     TEXT NOT NULL,
      logo_url        TEXT,
      primary_color   TEXT,
      modules         JSONB NOT NULL DEFAULT '[]',
      is_published    BOOLEAN NOT NULL DEFAULT FALSE,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await q.query(`
    CREATE TABLE IF NOT EXISTS staff.staff (
      id               UUID PRIMARY KEY,
      tenant_id        UUID NOT NULL,
      email            TEXT NOT NULL,
      name             TEXT NOT NULL,
      role             TEXT NOT NULL,
      google_oauth_id  TEXT,
      is_active        BOOLEAN NOT NULL DEFAULT TRUE,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(tenant_id, google_oauth_id)
    )
  `);

  await q.query(`
    CREATE TABLE IF NOT EXISTS customer.customers (
      id               UUID PRIMARY KEY,
      tenant_id        UUID NOT NULL,
      email            TEXT NOT NULL,
      name             TEXT NOT NULL,
      google_oauth_id  TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await q.query(`
    CREATE TABLE IF NOT EXISTS booking.services (
      id                       UUID PRIMARY KEY,
      tenant_id                UUID NOT NULL,
      name                     TEXT NOT NULL,
      description              TEXT,
      price_amount             NUMERIC(10,2) NOT NULL,
      price_currency           TEXT NOT NULL DEFAULT 'BRL',
      duration_minutes         INTEGER NOT NULL,
      loyalty_points           INTEGER NOT NULL DEFAULT 0,
      requires_pickup_address  BOOLEAN NOT NULL DEFAULT FALSE,
      is_active                BOOLEAN NOT NULL DEFAULT TRUE,
      created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await q.query(`
    CREATE TABLE IF NOT EXISTS booking.bookings (
      id              UUID PRIMARY KEY,
      tenant_id       UUID NOT NULL,
      customer_id     UUID,
      type            TEXT NOT NULL,
      status          TEXT NOT NULL,
      scheduled_at    TIMESTAMPTZ NOT NULL,
      vehicle_plate   TEXT NOT NULL,
      vehicle_model   TEXT,
      notes           TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await q.query(`
    CREATE TABLE IF NOT EXISTS booking.booking_lines (
      id                     UUID PRIMARY KEY,
      tenant_id              UUID NOT NULL,
      booking_id             UUID NOT NULL,
      service_id             UUID NOT NULL,
      price_amount           NUMERIC(10,2) NOT NULL,
      price_currency         TEXT NOT NULL DEFAULT 'BRL',
      loyalty_points_earned  INTEGER NOT NULL DEFAULT 0
    )
  `);

  await q.query(`
    CREATE TABLE IF NOT EXISTS loyalty.loyalty_entries (
      id               UUID PRIMARY KEY,
      tenant_id        UUID NOT NULL,
      booking_id       UUID NOT NULL,
      booking_line_id  UUID NOT NULL,
      points           INTEGER NOT NULL,
      expires_at       TIMESTAMPTZ NOT NULL,
      earned_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(tenant_id, booking_line_id)
    )
  `);
}

// ── Seed functions ────────────────────────────────────────────────────────────

async function seedTenants(q: ReturnType<DataSource['createQueryRunner']>): Promise<void> {
  const settings = JSON.stringify(TENANT_SETTINGS);
  await q.query(
    `INSERT INTO platform.tenants (id, slug, name, settings) VALUES
      ($1, 'lavacar-beloauto', 'Lavacar BeloAuto', $3),
      ($2, 'autospa-premium',  'AutoSpa Premium',  $3)
    ON CONFLICT (id) DO NOTHING`,
    [IDS.tenantA, IDS.tenantB, settings],
  );
}

async function seedStaff(q: ReturnType<DataSource['createQueryRunner']>): Promise<void> {
  await q.query(
    `INSERT INTO staff.staff (id, tenant_id, email, name, role, google_oauth_id) VALUES
      ($1, $4, 'admin@lavacar.com.br',       'Admin Lavacar',  'MANAGER', 'google-sub-admin-a'),
      ($2, $4, 'funcionario@lavacar.com.br', 'Funcionário',    'STAFF',   'google-sub-worker-a'),
      ($3, $5, 'admin@autospa.com.br',       'Admin AutoSpa',  'MANAGER', 'google-sub-admin-b')
    ON CONFLICT (id) DO NOTHING`,
    [IDS.staffAdminA, IDS.staffWorkerA, IDS.staffAdminB, IDS.tenantA, IDS.tenantB],
  );
}

async function seedCustomers(q: ReturnType<DataSource['createQueryRunner']>): Promise<void> {
  await q.query(
    `INSERT INTO customer.customers (id, tenant_id, email, name, google_oauth_id) VALUES
      ($1, $3, 'cliente@email.com.br', 'Cliente Teste', 'google-sub-customer-a'),
      ($2, $4, 'cliente@email.com.br', 'Cliente Teste', 'google-sub-customer-a')
    ON CONFLICT (id) DO NOTHING`,
    [IDS.customerA1, IDS.customerA2, IDS.tenantA, IDS.tenantB],
  );
}

async function seedServices(q: ReturnType<DataSource['createQueryRunner']>): Promise<void> {
  await q.query(
    `INSERT INTO booking.services
      (id, tenant_id, name, price_amount, duration_minutes, loyalty_points, requires_pickup_address) VALUES
      ($1, $5, 'Lavagem Simples',      80.00, 30,  5,  FALSE),
      ($2, $5, 'Lavagem Completa',    150.00, 60,  10, FALSE),
      ($3, $5, 'Polimento',           350.00, 120, 25, TRUE),
      ($4, $6, 'Higienização Interna',200.00, 90,  15, FALSE)
    ON CONFLICT (id) DO NOTHING`,
    [
      IDS.serviceSimples,
      IDS.serviceCompleta,
      IDS.servicePolimento,
      IDS.serviceHigienizacao,
      IDS.tenantA,
      IDS.tenantB,
    ],
  );
}

async function seedHotsites(q: ReturnType<DataSource['createQueryRunner']>): Promise<void> {
  const modulesA = JSON.stringify([
    { type: 'HERO', order: 1, visible: true },
    { type: 'SERVICE_LIST', order: 2, visible: true },
    { type: 'BOOKING_CTA', order: 3, visible: true },
  ]);
  const modulesB = JSON.stringify([
    { type: 'HERO', order: 1, visible: true },
    { type: 'SERVICE_LIST', order: 2, visible: true },
  ]);
  await q.query(
    `INSERT INTO platform.hotsite_configs
      (id, tenant_id, tenant_slug, tenant_name, modules, is_published) VALUES
      ($1, $3, 'lavacar-beloauto', 'Lavacar BeloAuto', $5, TRUE),
      ($2, $4, 'autospa-premium',  'AutoSpa Premium',  $6, TRUE)
    ON CONFLICT (id) DO NOTHING`,
    [IDS.hotsiteA, IDS.hotsiteB, IDS.tenantA, IDS.tenantB, modulesA, modulesB],
  );
}

async function seedBookings(q: ReturnType<DataSource['createQueryRunner']>): Promise<void> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);

  const lastWeek = new Date();
  lastWeek.setDate(lastWeek.getDate() - 7);
  lastWeek.setHours(10, 0, 0, 0);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 180);

  await q.query(
    `INSERT INTO booking.bookings
      (id, tenant_id, customer_id, type, status, scheduled_at, vehicle_plate) VALUES
      ($1, $4, $7, 'CUSTOMER', 'PENDING',   NOW() + INTERVAL '2 days', 'ABC-1234'),
      ($2, $4, $7, 'CUSTOMER', 'APPROVED',  $5,                         'DEF-5678'),
      ($3, $4, $7, 'CUSTOMER', 'COMPLETED', $6,                         'GHI-9012')
    ON CONFLICT (id) DO NOTHING`,
    [
      IDS.bookingPending,
      IDS.bookingApproved,
      IDS.bookingCompleted,
      IDS.tenantA,
      tomorrow.toISOString(),
      lastWeek.toISOString(),
      IDS.customerA1,
    ],
  );

  await q.query(
    `INSERT INTO booking.booking_lines
      (id, tenant_id, booking_id, service_id, price_amount, loyalty_points_earned) VALUES
      ($1, $2, $3, $4, 150.00, 10)
    ON CONFLICT (id) DO NOTHING`,
    [IDS.lineCompleted, IDS.tenantA, IDS.bookingCompleted, IDS.serviceCompleta],
  );

  await q.query(
    `INSERT INTO loyalty.loyalty_entries
      (id, tenant_id, booking_id, booking_line_id, points, expires_at) VALUES
      ($1, $2, $3, $4, 10, $5)
    ON CONFLICT (id) DO NOTHING`,
    [
      IDS.loyaltyEntry,
      IDS.tenantA,
      IDS.bookingCompleted,
      IDS.lineCompleted,
      expiresAt.toISOString(),
    ],
  );
}

// ── Summary ──────────────────────────────────────────────────────────────────

function printSummary(): void {
  const lines = [
    '',
    '╔══════════════════════════════════════════════════════════════╗',
    '║                    BeloAuto Seed — Done                      ║',
    '╠══════════════════════════════════════════════════════════════╣',
    '║  Tenant A  │ Lavacar BeloAuto   │ lavacar-beloauto           ║',
    '║  Tenant B  │ AutoSpa Premium    │ autospa-premium            ║',
    '╠══════════════════════════════════════════════════════════════╣',
    '║  Staff     │ admin@lavacar.com.br       (MANAGER, Tenant A)  ║',
    '║            │ funcionario@lavacar.com.br (STAFF,   Tenant A)  ║',
    '║            │ admin@autospa.com.br       (MANAGER, Tenant B)  ║',
    '╠══════════════════════════════════════════════════════════════╣',
    '║  Customer  │ cliente@email.com.br (exists in both tenants)   ║',
    '╠══════════════════════════════════════════════════════════════╣',
    '║  OAuth IDs │ google-sub-admin-a   (admin, Tenant A)          ║',
    '║            │ google-sub-worker-a  (staff, Tenant A)          ║',
    '║            │ google-sub-admin-b   (admin, Tenant B)          ║',
    '║            │ google-sub-customer-a (customer, both tenants)  ║',
    '╠══════════════════════════════════════════════════════════════╣',
    '║  Bookings  │ 1 PENDING, 1 APPROVED (tomorrow), 1 COMPLETED   ║',
    '║            │ Loyalty: 10pts earned on COMPLETED booking       ║',
    '╚══════════════════════════════════════════════════════════════╝',
    '',
  ];
  lines.forEach((l) => process.stdout.write(l + '\n'));
}

seed().catch((err: unknown) => {
  process.stderr.write(`Seed failed: ${String(err)}\n`);
  process.exit(1);
});
