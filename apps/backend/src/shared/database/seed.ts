import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';

config();

// ── Fixed UUIDs ensure idempotency across multiple runs ──────────────────────
// tenantA/tenantB keep their original ids/meaning (Lavacar BeloAuto / AutoSpa Premium).
// tenantIkaro is the platform's own US-localized demo tenant (en/USD/MM-DD-YYYY/ZIP code) —
// it's what closes the TD02-S09 localization E2E gap, exercising the non-BR branch of the
// CountrySpec registry. tenantA/tenantB stay pt-BR/BRL, the BR regression baseline.
const IDS = {
  tenantIkaro: '00000000-0000-7000-8000-000000000003',
  tenantA: '00000000-0000-7000-8000-000000000001',
  tenantB: '00000000-0000-7000-8000-000000000002',

  staffAdminIkaro: '00000000-0000-7000-8001-000000000004',
  staffAdminA: '00000000-0000-7000-8001-000000000001',
  staffWorkerA: '00000000-0000-7000-8001-000000000002',
  staffAdminB: '00000000-0000-7000-8001-000000000003',

  customerA1: '00000000-0000-7000-8002-000000000001', // cliente@ in tenant A
  customerA2: '00000000-0000-7000-8002-000000000002', // cliente@ in tenant B

  serviceIkaroBasica: '00000000-0000-7000-8003-000000000005',
  serviceIkaroPremium: '00000000-0000-7000-8003-000000000006',
  serviceSimples: '00000000-0000-7000-8003-000000000001',
  serviceCompleta: '00000000-0000-7000-8003-000000000002',
  servicePolimento: '00000000-0000-7000-8003-000000000003',
  serviceHigienizacao: '00000000-0000-7000-8003-000000000004',

  hotsiteIkaro: '00000000-0000-7000-8004-000000000003',
  hotsiteA: '00000000-0000-7000-8004-000000000001',
  hotsiteB: '00000000-0000-7000-8004-000000000002',

  bookingPending: '00000000-0000-7000-8005-000000000001',
  bookingApproved: '00000000-0000-7000-8005-000000000002',
  bookingCompleted: '00000000-0000-7000-8005-000000000003',

  lineCompleted: '00000000-0000-7000-8006-000000000001',
  loyaltyEntry: '00000000-0000-7000-8007-000000000001',
};

// Matches TenantSettingsProps exactly — snake_case keys, null for closed days
const TENANT_SETTINGS_BR = {
  loyalty: {
    expiry_days: 180,
    enable_notifications: true,
    expiry_warning_days: 7,
  },
  booking: {
    cancellation_window_hours: 48,
    auto_approve_enabled: false,
    min_booking_advance_hours: 0,
    max_booking_advance_days: 90,
    service_buffer_minutes: 60,
    slot_granularity_minutes: 30,
  },
  business_hours: {
    timezone: 'America/Sao_Paulo',
    monday: { open: '08:00', close: '18:00' },
    tuesday: { open: '08:00', close: '18:00' },
    wednesday: { open: '08:00', close: '18:00' },
    thursday: { open: '08:00', close: '18:00' },
    friday: { open: '08:00', close: '18:00' },
    saturday: { open: '08:00', close: '14:00' },
    sunday: null,
  },
  localization: {
    country_code: 'BR',
    currency: 'BRL',
    language: 'pt-BR',
    decimal_places: 2,
  },
  notification: {
    from_email: null,
  },
};

// Ikaro (TD02-S09) — en/USD/America/New_York, exercises the US CountrySpec branch.
const TENANT_SETTINGS_US = {
  ...TENANT_SETTINGS_BR,
  business_hours: {
    ...TENANT_SETTINGS_BR.business_hours,
    timezone: 'America/New_York',
  },
  localization: {
    country_code: 'US',
    currency: 'USD',
    language: 'en',
    decimal_places: 2,
  },
};

async function seed(): Promise<void> {
  const host = process.env['DB_HOST'];
  const port = Number(process.env['DB_PORT'] ?? 5432);
  const username = process.env['DB_USER'];
  const password = process.env['DB_PASSWORD'];
  const database = process.env['DB_NAME'];

  if (!host || !username || !password || !database) {
    throw new Error('DB_HOST, DB_USER, DB_PASSWORD, DB_NAME are required');
  }

  const ds = new DataSource({
    type: 'postgres',
    host,
    port,
    username,
    password,
    database,
    synchronize: false,
    migrationsRun: false,
  });

  await ds.initialize();
  const q = ds.createQueryRunner();
  await q.connect();
  await q.startTransaction();

  try {
    const alreadySeeded = (await q.query(
      `SELECT EXISTS(SELECT 1 FROM platform.tenants WHERE id = $1) AS exists`,
      [IDS.tenantA],
    )) as Array<{ exists: boolean }>;

    if (alreadySeeded[0]?.exists) {
      process.stdout.write('✓ Database already seeded — skipping.\n');
      await q.rollbackTransaction();
      return;
    }

    await seedTenants(q);
    await seedHotsites(q);
    await seedStaff(q);
    await seedCustomers(q);
    await seedServices(q);
    await seedBookings(q);
    await seedNotificationTemplates(q);

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

// ── Seed functions — pure data insertion, schema is owned by migrations ──────

async function seedTenants(q: ReturnType<DataSource['createQueryRunner']>): Promise<void> {
  const settingsUS = JSON.stringify(TENANT_SETTINGS_US);
  const settingsBR = JSON.stringify(TENANT_SETTINGS_BR);
  await q.query(
    `INSERT INTO platform.tenants (id, name, slug, settings, is_active) VALUES
      ($1, 'Ikaro',           'ikaro',            $4, true),
      ($2, 'Lavacar BeloAuto', 'lavacar-beloauto', $5, true),
      ($3, 'AutoSpa Premium',  'autospa-premium',  $5, true)
    ON CONFLICT (id) DO NOTHING`,
    [IDS.tenantIkaro, IDS.tenantA, IDS.tenantB, settingsUS, settingsBR],
  );
}

async function seedHotsites(q: ReturnType<DataSource['createQueryRunner']>): Promise<void> {
  const baseBranding = {
    secondaryColor: '#eff6ff',
    backgroundColor: '#ffffff',
    textColor: '#111827',
    headingFontFamily: 'Inter, sans-serif',
    bodyFontFamily: 'Inter, sans-serif',
    logoUrl: '',
    borderRadius: 'rounded',
    buttonStyle: 'filled',
    spacing: 'comfortable',
    shadowStyle: 'subtle',
  };
  const brandingIkaro = JSON.stringify({ ...baseBranding, primaryColor: '#6366F1' });
  const brandingA = JSON.stringify({ ...baseBranding, primaryColor: '#0055A4' });
  const brandingB = JSON.stringify({ ...baseBranding, primaryColor: '#C8102E' });
  const layoutIkaro = JSON.stringify([
    {
      type: 'HERO',
      enabled: true,
      data: {
        variant: 'centered',
        title: 'Book your service in a few clicks',
        ctaLabel: 'Book now',
        ctaTarget: 'booking-form',
      },
    },
    {
      type: 'SERVICE_LIST',
      enabled: true,
      data: { showPrices: true, showPoints: true, layout: 'grid' },
    },
    {
      type: 'BOOKING_CTA',
      enabled: true,
      data: { title: 'Book your appointment', ctaLabel: 'Book now' },
    },
  ]);
  const layoutA = JSON.stringify([
    {
      type: 'HERO',
      enabled: true,
      data: {
        variant: 'centered',
        title: 'Cuidado completo para o seu carro',
        ctaLabel: 'Agendar agora',
        ctaTarget: 'booking-form',
      },
    },
    {
      type: 'SERVICE_LIST',
      enabled: true,
      data: { showPrices: true, showPoints: true, layout: 'grid' },
    },
    {
      type: 'BOOKING_CTA',
      enabled: true,
      data: { title: 'Agende seu horário', ctaLabel: 'Agendar agora' },
    },
  ]);
  const layoutB = JSON.stringify([
    {
      type: 'HERO',
      enabled: true,
      data: {
        variant: 'centered',
        title: 'Seu carro impecável',
        ctaLabel: 'Agendar agora',
        ctaTarget: 'booking-form',
      },
    },
    {
      type: 'SERVICE_LIST',
      enabled: true,
      data: { showPrices: true, showPoints: true, layout: 'grid' },
    },
  ]);
  await q.query(
    `INSERT INTO platform.hotsite_configs (id, tenant_id, branding, layout, is_published) VALUES
      ($1, $4, $7, $10, true),
      ($2, $5, $8, $11, true),
      ($3, $6, $9, $12, true)
    ON CONFLICT (id) DO NOTHING`,
    [
      IDS.hotsiteIkaro,
      IDS.hotsiteA,
      IDS.hotsiteB,
      IDS.tenantIkaro,
      IDS.tenantA,
      IDS.tenantB,
      brandingIkaro,
      brandingA,
      brandingB,
      layoutIkaro,
      layoutA,
      layoutB,
    ],
  );
}

async function seedStaff(q: ReturnType<DataSource['createQueryRunner']>): Promise<void> {
  await q.query(
    `INSERT INTO staff.staff (id, tenant_id, email, role, google_oauth_id, is_active) VALUES
      ($1, $5, 'admin@ikaro.com',          'MANAGER', 'google-sub-admin-ikaro', true),
      ($2, $6, 'admin@lavacar.com.br',       'MANAGER', 'google-sub-admin-a',     true),
      ($3, $6, 'funcionario@lavacar.com.br', 'STAFF',   'google-sub-worker-a',    true),
      ($4, $7, 'admin@autospa.com.br',       'MANAGER', 'google-sub-admin-b',     true)
    ON CONFLICT (id) DO NOTHING`,
    [
      IDS.staffAdminIkaro,
      IDS.staffAdminA,
      IDS.staffWorkerA,
      IDS.staffAdminB,
      IDS.tenantIkaro,
      IDS.tenantA,
      IDS.tenantB,
    ],
  );
}

async function seedCustomers(q: ReturnType<DataSource['createQueryRunner']>): Promise<void> {
  await q.query(
    `INSERT INTO customer.customers
      (id, tenant_id, google_oauth_id, email, name, phone, default_address) VALUES
      ($1, $3, 'google-sub-customer-a', 'cliente@email.com.br', 'Cliente Teste', NULL, NULL),
      ($2, $4, 'google-sub-customer-a', 'cliente@email.com.br', 'Cliente Teste', NULL, NULL)
    ON CONFLICT (id) DO NOTHING`,
    [IDS.customerA1, IDS.customerA2, IDS.tenantA, IDS.tenantB],
  );
}

async function seedServices(q: ReturnType<DataSource['createQueryRunner']>): Promise<void> {
  await q.query(
    `INSERT INTO booking.services
      (id, tenant_id, name, price_amount, duration_minutes, loyalty_points_value, requires_pickup_address) VALUES
      ($1, $7, 'Basic Wash',            70.00,  30,  5,  false),
      ($2, $7, 'Premium Wash',         180.00,  75,  12, false),
      ($3, $8, 'Lavagem Simples',       80.00,  30,  5,  false),
      ($4, $8, 'Lavagem Completa',     150.00,  60,  10, false),
      ($5, $8, 'Polimento',            350.00, 120,  25, true),
      ($6, $9, 'Higienização Interna', 200.00,  90,  15, false)
    ON CONFLICT (id) DO NOTHING`,
    [
      IDS.serviceIkaroBasica,
      IDS.serviceIkaroPremium,
      IDS.serviceSimples,
      IDS.serviceCompleta,
      IDS.servicePolimento,
      IDS.serviceHigienizacao,
      IDS.tenantIkaro,
      IDS.tenantA,
      IDS.tenantB,
    ],
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
      (id, tenant_id, customer_id, type, status, scheduled_at,
       contact_email, contact_name, contact_phone,
       total_duration_mins, total_price_amount) VALUES
      ($1, $4, $7, 'CUSTOMER', 'PENDING',   NOW() + INTERVAL '2 days',
       'cliente@email.com.br', 'Cliente BeloAuto', '+5531999999999', 30, 80.00),
      ($2, $4, $7, 'CUSTOMER', 'APPROVED',  $5,
       'cliente@email.com.br', 'Cliente BeloAuto', '+5531999999999', 60, 150.00),
      ($3, $4, $7, 'CUSTOMER', 'COMPLETED', $6,
       'cliente@email.com.br', 'Cliente BeloAuto', '+5531999999999', 60, 150.00)
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
      (line_id, tenant_id, booking_id, service_id,
       service_name_at_booking, price_at_booking_amount,
       duration_mins_at_booking, points_value_at_booking) VALUES
      ($1, $2, $3, $4, 'Lavagem Completa', 150.00, 60, 10)
    ON CONFLICT (line_id) DO NOTHING`,
    [IDS.lineCompleted, IDS.tenantA, IDS.bookingCompleted, IDS.serviceCompleta],
  );

  await q.query(
    `INSERT INTO loyalty.loyalty_entries
      (id, tenant_id, customer_id, booking_id, booking_line_id, service_id, points, expires_at) VALUES
      ($1, $2, $3, $4, $5, $6, 10, $7)
    ON CONFLICT (id) DO NOTHING`,
    [
      IDS.loyaltyEntry,
      IDS.tenantA,
      IDS.customerA1,
      IDS.bookingCompleted,
      IDS.lineCompleted,
      IDS.serviceCompleta,
      expiresAt.toISOString(),
    ],
  );
}

async function seedNotificationTemplates(
  q: ReturnType<DataSource['createQueryRunner']>,
): Promise<void> {
  // Mirrors TenantProvisionedHandler → copyGlobalDefaultsForTenant
  // Copies all global templates (tenant_id IS NULL) to each seed tenant.
  for (const tenantId of [IDS.tenantIkaro, IDS.tenantA, IDS.tenantB]) {
    await q.query(
      `INSERT INTO notification.notification_templates
         (id, tenant_id, trigger_event, channel, subject, body, created_at, updated_at)
       SELECT gen_random_uuid(), $1::uuid, trigger_event, channel, subject, body, now(), now()
       FROM notification.notification_templates
       WHERE tenant_id IS NULL
       ON CONFLICT DO NOTHING`,
      [tenantId],
    );
  }
}

// ── Summary ──────────────────────────────────────────────────────────────────

function printSummary(): void {
  const lines = [
    '',
    '╔════════════════════════════════════════════════════════════════╗',
    '║                    Ikaro Seed — Done                           ║',
    '╠════════════════════════════════════════════════════════════════╣',
    '║  Tenant 1  │ Ikaro (US)          │ ikaro                       ║',
    '║  Tenant 2  │ Lavacar BeloAuto (BR)│ lavacar-beloauto           ║',
    '║  Tenant 3  │ AutoSpa Premium (BR) │ autospa-premium            ║',
    '╠════════════════════════════════════════════════════════════════╣',
    '║  Staff     │ admin@ikaro.com            (MANAGER, Ikaro)       ║',
    '║            │ admin@lavacar.com.br       (MANAGER, BeloAuto)    ║',
    '║            │ funcionario@lavacar.com.br (STAFF,   BeloAuto)    ║',
    '║            │ admin@autospa.com.br       (MANAGER, AutoSpa)     ║',
    '╠════════════════════════════════════════════════════════════════╣',
    '║  Customer  │ cliente@email.com.br (BeloAuto + AutoSpa)         ║',
    '╠════════════════════════════════════════════════════════════════╣',
    '║  OAuth IDs │ google-sub-admin-ikaro (MANAGER, Ikaro)           ║',
    '║            │ google-sub-admin-a     (MANAGER, BeloAuto)        ║',
    '║            │ google-sub-worker-a    (STAFF,   BeloAuto)        ║',
    '║            │ google-sub-admin-b     (MANAGER, AutoSpa)         ║',
    '║            │ google-sub-customer-a (CUSTOMER, BeloAuto+AutoSpa)║',
    '╠════════════════════════════════════════════════════════════════╣',
    '║  Bookings  │ BeloAuto: 1 PENDING, 1 APPROVED, 1 COMPLETED      ║',
    '║            │ Loyalty: 10 pts earned on COMPLETED booking       ║',
    '╠════════════════════════════════════════════════════════════════╣',
    '║  Notifs    │ Global templates copied to all 3 tenants          ║',
    '╚════════════════════════════════════════════════════════════════╝',
    '',
  ];
  lines.forEach((l) => process.stdout.write(l + '\n'));
}

seed().catch((err: unknown) => {
  process.stderr.write(`Seed failed: ${String(err)}\n`);
  process.exit(1);
});
