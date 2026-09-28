import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { BookingEntityBuilder } from '../../../../test/builders/booking/index';
import { actorHeaders } from '../../../../test/utils/actor-headers';
import { createBookingIntegrationApp } from '../../../../test/utils/booking-integration-app';
import { InMemoryTenantSettingsPort } from '../../../../test/infrastructure/in-memory-tenant-settings.port';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { TENANT_SETTINGS_PORT } from '../../../../shared/ports/tenant-settings.port';
import { TenantSettings } from '../../../platform/domain/value-objects/tenant-settings.vo';
import { PlatformModule } from '../../../platform/platform.module';
import { BookingEntity } from '../entities/booking.entity';

const TEST_KEY = 'booking-list-integ-key-booking-xxxxx'; // 36 chars
const STAFF_ID = '20000000-0000-4000-8000-000000000031';
const SAO_PAULO = 'America/Sao_Paulo';
const AUCKLAND = 'Pacific/Auckland';

describe('GET /bookings date-key range (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let saoPauloTenantId: string;
  let aucklandTenantId: string;
  const idBySlot: Record<string, string> = {};
  // The RequestInterceptor loads each tenant's RequestContext.settings from this port.
  const settingsPort = new InMemoryTenantSettingsPort();

  async function provisionTenant(label: string, timezone: string): Promise<string> {
    const slug = `booking-list-${label}-${uuidv7().slice(-12)}`;
    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('X-Platform-Admin-Key', TEST_KEY)
      .send({
        name: `Booking List ${label}`,
        slug,
        adminEmail: `admin@${slug}.test`,
        country_code: 'BR',
        timezone,
      })
      .expect(201);
    const tenantId = body.tenantId as string;
    settingsPort.set(tenantId, TenantSettings.default(timezone).toJSON());
    return tenantId;
  }

  async function seedBooking(tenantId: string, scheduledAt: string): Promise<string> {
    const booking = new BookingEntityBuilder()
      .withTenantId(tenantId)
      .withScheduledAt(new Date(scheduledAt))
      .build();
    await ds.getRepository(BookingEntity).save(booking);
    return booking.id;
  }

  async function listIds(tenantId: string, query: string): Promise<string[]> {
    const { body } = await request(app.getHttpServer())
      .get(`/bookings?${query}`)
      .set(actorHeaders(tenantId, STAFF_ID, 'MANAGER'))
      .expect(200);
    return (body.items as { id: string }[]).map((i) => i.id).sort((a, b) => a.localeCompare(b));
  }

  const sorted = (...ids: string[]) => [...ids].sort((a, b) => a.localeCompare(b));

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = TEST_KEY;
    ({ app, ds } = await createBookingIntegrationApp({
      extraModules: [PlatformModule],
      overrideProviders: [{ provide: TENANT_SETTINGS_PORT, useValue: settingsPort }],
    }));

    saoPauloTenantId = await provisionTenant('sp', SAO_PAULO);
    aucklandTenantId = await provisionTenant('akl', AUCKLAND);

    // America/Sao_Paulo is UTC-3: 15:00Z is Sunday 12:00 local, 01:00Z on the 17th is Sunday
    // 22:00 local (already Monday in UTC), 03:00Z on the 17th is Monday 00:00 local.
    idBySlot['sundayNoon'] = await seedBooking(saoPauloTenantId, '2026-08-16T15:00:00.000Z');
    idBySlot['sundayNight'] = await seedBooking(saoPauloTenantId, '2026-08-17T01:00:00.000Z');
    idBySlot['mondayMidnight'] = await seedBooking(saoPauloTenantId, '2026-08-17T03:00:00.000Z');
    // Pacific/Auckland is UTC+12 in August: 12:30Z on the 15th is 00:30 on the 16th local.
    idBySlot['aucklandEarly16th'] = await seedBooking(aucklandTenantId, '2026-08-15T12:30:00.000Z');
  });

  afterAll(async () => {
    try {
      for (const tenantId of [saoPauloTenantId, aucklandTenantId]) {
        if (tenantId) await ds.getRepository(BookingEntity).delete({ tenantId });
      }
    } finally {
      delete process.env['PLATFORM_ADMIN_KEY'];
      await app.close();
    }
  });

  it('returns the Sunday-night booking in its own local week, and none from the next week', async () => {
    expect(await listIds(saoPauloTenantId, 'from=2026-08-10&to=2026-08-16')).toEqual(
      sorted(idBySlot['sundayNoon'], idBySlot['sundayNight']),
    );
    expect(await listIds(saoPauloTenantId, 'from=2026-08-17&to=2026-08-23')).toEqual([
      idBySlot['mondayMidnight'],
    ]);
  });

  it('keeps instant from/to exactly as before (an older BFF is unaffected)', async () => {
    const query = 'from=2026-08-10T00:00:00.000Z&to=2026-08-16T23:59:59.999Z';

    expect(await listIds(saoPauloTenantId, query)).toEqual([idBySlot['sundayNoon']]);
  });

  it("converts a date key with the caller tenant's own timezone", async () => {
    const query = 'from=2026-08-16&to=2026-08-16';

    expect(await listIds(aucklandTenantId, query)).toEqual([idBySlot['aucklandEarly16th']]);
  });

  it("tenant isolation: never returns another tenant's booking for the same date range", async () => {
    const query = 'from=2026-08-10&to=2026-08-23';

    const saoPauloIds = await listIds(saoPauloTenantId, query);
    const aucklandIds = await listIds(aucklandTenantId, query);

    expect(saoPauloIds).not.toContain(idBySlot['aucklandEarly16th']);
    expect(aucklandIds).toEqual([idBySlot['aucklandEarly16th']]);
  });

  it('returns 400 for a date key that is not a real calendar date', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/bookings?from=2026-02-30')
      .set(actorHeaders(saoPauloTenantId, STAFF_ID, 'MANAGER'))
      .expect(400);

    expect(body.status).toBe(400);
    expect((body.violations as { field: string }[]).map((v) => v.field)).toContain('from');
  });
});
