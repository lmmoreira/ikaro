import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { TenantEntityBuilder } from '../../../../test/builders/platform';
import { createBillingIntegrationApp } from '../../../../test/utils/billing-integration-app';
import { TenantEntity } from '../../../platform/infrastructure/entities/tenant.entity';
import {
  BILLING_BOOKING_PORT,
  IBillingBookingPort,
} from '../../application/ports/billing-booking.port';

// M26-S18a: Billing → Booking through the real module wiring (BillingModule imports the lighter
// BookingFeatureRemovalModule) and the real database. The queries' boundary and exclusion rules are
// pinned in the Booking repository's own integration spec; this proves the port is wired and
// answers for a real tenant.
describe('BillingBookingAdapter (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let port: IBillingBookingPort;
  const tenantIds: string[] = [];

  beforeAll(async () => {
    ({ app, ds } = await createBillingIntegrationApp());
    port = app.get<IBillingBookingPort>(BILLING_BOOKING_PORT);
  });

  afterEach(async () => {
    await ds.query(`DELETE FROM "platform"."tenants" WHERE "id" = ANY($1::uuid[])`, [tenantIds]);
    tenantIds.length = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers an empty impact for a real tenant with no bookings or schedules', async () => {
    const tenantId = uuidv7();
    tenantIds.push(tenantId);
    await ds
      .getRepository(TenantEntity)
      .insert(new TenantEntityBuilder().withId(tenantId).withSlug(`guard-${uuidv7()}`).build());

    await expect(port.getBookingFeatureRemovalImpact(tenantId, '2026-12-15')).resolves.toEqual({
      effectiveFrom: '2026-12-15',
      bookings: 0,
      recurringSchedules: 0,
      blockers: [],
    });
  });
});
