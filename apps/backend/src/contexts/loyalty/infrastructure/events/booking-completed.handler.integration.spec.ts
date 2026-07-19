import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { IEventBus, EVENT_BUS } from '../../../../shared/ports/event-bus.port';
import { TENANT_SETTINGS_PORT } from '../../../../shared/ports/tenant-settings.port';
import { InMemoryNotificationDispatcher } from '../../../../test/infrastructure/in-memory-notification-dispatcher';
import { InMemoryTenantSettingsPort } from '../../../../test/infrastructure/in-memory-tenant-settings.port';
import { RoutingInMemoryEventBus } from '../../../../test/infrastructure/routing-in-memory-event-bus';
import { createNotificationIntegrationApp } from '../../../../test/utils/notification-integration-app';
import { ServiceEntityBuilder } from '../../../../test/builders/booking/service-entity.builder';
import { CustomerEntityBuilder } from '../../../../test/builders/customer/customer-entity.builder';
import { TenantSettingsPropsBuilder } from '../../../../test/builders/platform/tenant-settings-props.builder';
import { BookingEntity } from '../../../booking/infrastructure/entities/booking.entity';
import { BookingLineEntity } from '../../../booking/infrastructure/entities/booking-line.entity';
import { ServiceEntity } from '../../../booking/infrastructure/entities/service.entity';
import { ScheduleClosureEntity } from '../../../booking/infrastructure/entities/schedule-closure.entity';
import { ScheduleOpeningEntity } from '../../../booking/infrastructure/entities/schedule-opening.entity';
import { BookingModule } from '../../../booking/booking.module';
import { CustomerEntity } from '../../../customer/infrastructure/entities/customer.entity';
import { StaffEntity } from '../../../staff/infrastructure/entities/staff.entity';
import { TenantEntity } from '../../../platform/infrastructure/entities/tenant.entity';
import { LoyaltyModule } from '../../loyalty.module';
import { LoyaltyEntryEntity } from '../entities/loyalty-entry.entity';
import { LoyaltyBalanceEntity } from '../entities/loyalty-balance.entity';
import { LoyaltyRedemptionEntity } from '../entities/loyalty-redemption.entity';
import { BalanceExpiryLogEntity } from '../entities/balance-expiry-log.entity';
import { BookingCompleted } from '../../../booking/domain/events/booking-completed.event';

const PLATFORM_KEY = 'discount-completion-integ-key-xxxxx';

const BOOKING_ENTITIES = [
  BookingEntity,
  BookingLineEntity,
  ServiceEntity,
  ScheduleClosureEntity,
  ScheduleOpeningEntity,
  CustomerEntity,
] as const;

const LOYALTY_ENTITIES = [
  LoyaltyEntryEntity,
  LoyaltyBalanceEntity,
  LoyaltyRedemptionEntity,
  BalanceExpiryLogEntity,
] as const;

describe('Story: booking completion with a loyalty points discount (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let eventBus: RoutingInMemoryEventBus;
  let tenantSettingsPort: InMemoryTenantSettingsPort;

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = PLATFORM_KEY;
    process.env['JWT_SECRET'] = 'discount-completion-integ-test-secret-32ch';

    ({ app, ds } = await createNotificationIntegrationApp({
      dispatcher: new InMemoryNotificationDispatcher(),
      extraModules: [BookingModule, LoyaltyModule],
      extraEntities: [...BOOKING_ENTITIES, ...LOYALTY_ENTITIES],
      withRequestInterceptor: true,
    }));

    eventBus = app.get<IEventBus>(EVENT_BUS) as RoutingInMemoryEventBus;
    tenantSettingsPort = app.get<InMemoryTenantSettingsPort>(TENANT_SETTINGS_PORT);
  });

  afterAll(async () => {
    await app.close();
    delete process.env['PLATFORM_ADMIN_KEY'];
    delete process.env['JWT_SECRET'];
  });

  async function provisionTenantWithDiscountRate(rate: number) {
    const slug = `discount-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const adminEmail = `admin-${slug}@lavacar.com.br`;

    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('X-Platform-Admin-Key', PLATFORM_KEY)
      .send({ name: 'Discount Tenant', slug, adminEmail, country_code: 'BR' })
      .expect(201);
    const tenantId = body.tenantId as string;

    const settings = new TenantSettingsPropsBuilder()
      .withLoyalty({ pointsPerCurrencyUnit: rate })
      .build();

    // Real DB row — read by the loyalty context's cross-context port (LoyaltyPlatformAdapter).
    const tenantRow = await ds.getRepository(TenantEntity).findOne({ where: { id: tenantId } });
    tenantRow!.settings = settings;
    await ds.getRepository(TenantEntity).save(tenantRow!);

    // RequestContext source for the booking context — TENANT_SETTINGS_PORT is overridden
    // with this in-memory double by createNotificationIntegrationApp.
    tenantSettingsPort.set(tenantId, settings);

    const manager = await ds
      .getRepository(StaffEntity)
      .findOne({ where: { tenantId, role: 'MANAGER' } });

    const service = new ServiceEntityBuilder()
      .withTenantId(tenantId)
      .withName('Lavagem Premium')
      .withPriceAmount('100.00')
      .withDurationMinutes(60)
      .withLoyaltyPointsValue(10)
      .build();
    await ds.getRepository(ServiceEntity).save(service);

    const customerId = uuidv7();
    await ds
      .getRepository(CustomerEntity)
      .save(
        new CustomerEntityBuilder()
          .withId(customerId)
          .withTenantId(tenantId)
          .withEmail(`customer-${slug}@example.com`)
          .withPhone('+5531999888777')
          .build(),
      );

    return { tenantId, staffId: manager!.id, serviceId: service.id, customerId };
  }

  async function completeWithDiscount(params: {
    tenantId: string;
    staffId: string;
    customerId: string;
    serviceId: string;
    scheduledAt: string;
    discountByPoints: { pointsUsed: number; amountDeducted: number };
  }) {
    const { tenantId, staffId, customerId, serviceId, scheduledAt, discountByPoints } = params;

    const { body: created } = await request(app.getHttpServer())
      .post('/bookings/authenticated')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-ID', customerId)
      .set('X-Actor-Type', 'CUSTOMER')
      .set('X-Actor-Role', 'CUSTOMER')
      .send({ scheduledAt, serviceIds: [serviceId] })
      .expect(201);
    const bookingId = created.bookingId as string;

    await request(app.getHttpServer())
      .patch(`/bookings/${bookingId}/approve`)
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-ID', staffId)
      .set('X-Actor-Type', 'STAFF')
      .set('X-Actor-Role', 'MANAGER')
      .expect(200);

    const { body: bk } = await request(app.getHttpServer())
      .get(`/bookings/${bookingId}`)
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-ID', staffId)
      .set('X-Actor-Type', 'STAFF')
      .set('X-Actor-Role', 'MANAGER')
      .expect(200);

    const lines = (bk.lines as Array<{ lineId: string; priceAtBooking: { amount: number } }>).map(
      (l) => ({ lineId: l.lineId, actualPriceCharged: l.priceAtBooking.amount }),
    );

    const response = await request(app.getHttpServer())
      .patch(`/bookings/${bookingId}/complete`)
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-ID', staffId)
      .set('X-Actor-Type', 'STAFF')
      .set('X-Actor-Role', 'MANAGER')
      .send({ lines, afterServicePhotoUrls: [], discountByPoints })
      .expect(200);

    return { bookingId, response };
  }

  it('decrements the balance, records a LoyaltyRedemption, and persists the discount on the booking', async () => {
    const { tenantId, staffId, customerId, serviceId } = await provisionTenantWithDiscountRate(10);
    await ds.getRepository(LoyaltyBalanceEntity).save({ tenantId, customerId, currentPoints: 500 });

    const { bookingId, response } = await completeWithDiscount({
      tenantId,
      staffId,
      customerId,
      serviceId,
      scheduledAt: '2026-07-10T10:00:00.000Z',
      discountByPoints: { pointsUsed: 200, amountDeducted: 20 },
    });

    expect(response.body.totalActualPrice.amount).toBe(80);

    const bookingRow = await ds
      .getRepository(BookingEntity)
      .findOne({ where: { id: bookingId, tenantId } });
    expect(bookingRow!.discountPointsUsed).toBe(200);
    expect(bookingRow!.discountAmount).toBe('20.00');

    // RoutingInMemoryEventBus dispatches synchronously — by the time the PATCH above
    // resolved, CompleteBookingLoyaltyEffectsUseCase has already run.
    const balanceRow = await ds
      .getRepository(LoyaltyBalanceEntity)
      .findOne({ where: { tenantId, customerId } });
    // 500 seeded + 10 earned (this booking's service) - 200 redeemed = 310
    expect(balanceRow!.currentPoints).toBe(310);

    const redemptions = await ds.getRepository(LoyaltyRedemptionEntity).find({
      where: { tenantId, customerId },
    });
    expect(redemptions).toHaveLength(1);
    expect(redemptions[0].pointsRedeemed).toBe(200);
    expect(redemptions[0].bookingId).toBe(bookingId);
    expect(redemptions[0].redeemedBy).toBe(staffId);

    const entries = await ds.getRepository(LoyaltyEntryEntity).find({
      where: { tenantId, customerId, bookingId },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].serviceId).toBe(serviceId);
    expect(entries[0].points).toBe(10);
    expect(entries[0].bookingLineId).toBeDefined();
  });

  it('is idempotent — redelivering the BookingCompleted event does not double-redeem', async () => {
    const { tenantId, staffId, customerId, serviceId } = await provisionTenantWithDiscountRate(10);
    await ds.getRepository(LoyaltyBalanceEntity).save({ tenantId, customerId, currentPoints: 500 });

    await completeWithDiscount({
      tenantId,
      staffId,
      customerId,
      serviceId,
      scheduledAt: '2026-07-11T10:00:00.000Z',
      discountByPoints: { pointsUsed: 200, amountDeducted: 20 },
    });

    const replayedEvent = eventBus.published
      .filter((e) => e.eventName === 'BookingCompleted')
      .at(-1) as BookingCompleted;
    expect(replayedEvent).toBeDefined();

    await eventBus.publish(replayedEvent);

    const balanceRow = await ds
      .getRepository(LoyaltyBalanceEntity)
      .findOne({ where: { tenantId, customerId } });
    expect(balanceRow!.currentPoints).toBe(310);

    const redemptions = await ds.getRepository(LoyaltyRedemptionEntity).find({
      where: { tenantId, customerId },
    });
    expect(redemptions).toHaveLength(1);

    const entries = await ds.getRepository(LoyaltyEntryEntity).find({
      where: { tenantId, customerId },
    });
    expect(entries).toHaveLength(1);
  });

  it('tenant isolation: completing tenant A booking with a discount does not touch tenant B loyalty data', async () => {
    const tenantA = await provisionTenantWithDiscountRate(10);
    await ds
      .getRepository(LoyaltyBalanceEntity)
      .save({ tenantId: tenantA.tenantId, customerId: tenantA.customerId, currentPoints: 500 });

    const tenantB = await provisionTenantWithDiscountRate(10);
    await ds
      .getRepository(LoyaltyBalanceEntity)
      .save({ tenantId: tenantB.tenantId, customerId: tenantB.customerId, currentPoints: 777 });

    await completeWithDiscount({
      tenantId: tenantA.tenantId,
      staffId: tenantA.staffId,
      customerId: tenantA.customerId,
      serviceId: tenantA.serviceId,
      scheduledAt: '2026-07-12T10:00:00.000Z',
      discountByPoints: { pointsUsed: 200, amountDeducted: 20 },
    });

    const tenantBBalance = await ds
      .getRepository(LoyaltyBalanceEntity)
      .findOne({ where: { tenantId: tenantB.tenantId, customerId: tenantB.customerId } });
    expect(tenantBBalance!.currentPoints).toBe(777);

    const tenantBRedemptions = await ds
      .getRepository(LoyaltyRedemptionEntity)
      .find({ where: { tenantId: tenantB.tenantId } });
    expect(tenantBRedemptions).toHaveLength(0);

    const tenantBEntries = await ds
      .getRepository(LoyaltyEntryEntity)
      .find({ where: { tenantId: tenantB.tenantId } });
    expect(tenantBEntries).toHaveLength(0);
  });
});
