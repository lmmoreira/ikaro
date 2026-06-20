import { DataSource } from 'typeorm';
import { createTestDataSource } from '../../../../test/test-datasource';
import { BookingBuilder, ServiceEntityBuilder } from '../../../../test/builders/booking/index';
import { InMemoryTenantSettingsPort } from '../../../../test/infrastructure/in-memory-tenant-settings.port';
import { testAddress } from '../../../../test/utils/address-helpers';
import { Money } from '../../../../shared/value-objects/money';
import { TenantSettings } from '../../../platform/domain/value-objects/tenant-settings.vo';
import { BookingStatus } from '../../domain/booking.aggregate';
import { BookingLine } from '../../domain/booking-line.entity';
import { ServiceEntity } from '../entities/service.entity';
import { BookingEntity } from '../entities/booking.entity';
import { BookingLineEntity } from '../entities/booking-line.entity';
import { TypeOrmBookingRepository } from './typeorm-booking.repository';

const TENANT_A = '00000000-0000-7000-8000-000000000060';
const TENANT_B = '00000000-0000-7000-8000-000000000061';
const SERVICE_ID = '00000000-0000-7000-8000-000000000070';
const SERVICE_ID_2 = '00000000-0000-7000-8000-000000000071';
const SERVICE_ID_3 = '00000000-0000-7000-8000-000000000072';

describe('TypeOrmBookingRepository (integration)', () => {
  let dataSource: DataSource;
  let repo: TypeOrmBookingRepository;
  let settingsPort: InMemoryTenantSettingsPort;

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    settingsPort = new InMemoryTenantSettingsPort();
    repo = new TypeOrmBookingRepository(
      dataSource.getRepository(BookingEntity),
      dataSource.getRepository(BookingLineEntity),
      settingsPort,
    );

    // Seed a service so booking_lines FK (tenant_id, service_id) → services is satisfied
    const svc = new ServiceEntityBuilder()
      .withId(SERVICE_ID)
      .withTenantId(TENANT_A)
      .withName('Lavagem Completa')
      .withPriceAmount('150.00')
      .withDurationMinutes(60)
      .build();
    await dataSource.getRepository(ServiceEntity).save(svc);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('saves a booking with lines and reads it back — all fields survive the round-trip', async () => {
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withContactEmail('joao@example.com')
      .withContactName('João Silva')
      .withContactPhone('+5531999999999')
      .withContactAddress(testAddress())
      .withPickupAddress(testAddress({ street: 'Rua do Pickup', number: '10' }))
      .withScheduledAt(new Date('2026-07-01T10:00:00.000Z'))
      .withTotalDurationMins(60)
      .withTotalPrice(Money.from(150, 'BRL'))
      .withLines([
        BookingLine.reconstitute({
          lineId: '00000000-0000-7000-8000-000000000080',
          bookingId: 'placeholder',
          tenantId: TENANT_A,
          serviceId: SERVICE_ID,
          serviceNameAtBooking: 'Lavagem Completa',
          priceAtBooking: Money.from(150, 'BRL'),
          durationMinsAtBooking: 60,
          pointsValueAtBooking: 10,
          requiresPickupAddressAtBooking: true,
          actualPriceCharged: null,
        }),
      ])
      .build();

    await repo.save(booking);

    const found = await repo.findById(booking.id, TENANT_A);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(booking.id);
    expect(found!.tenantId).toBe(TENANT_A);
    expect(found!.status).toBe(BookingStatus.PENDING);
    expect(found!.type).toBe('GUEST');
    expect(found!.contactEmail.address).toBe('joao@example.com');
    expect(found!.contactName).toBe('João Silva');
    expect(found!.contactPhone.value).toBe('+5531999999999');
    expect(found!.contactAddress).not.toBeNull();
    expect(found!.pickupAddress).not.toBeNull();
    expect(found!.scheduledAt.toISOString()).toBe('2026-07-01T10:00:00.000Z');
    expect(found!.totalDurationMins).toBe(60);
    expect(found!.totalPrice.amount.toNumber()).toBe(150);
    expect(found!.totalPrice.currency).toBe('BRL');
    expect(found!.lines).toHaveLength(1);
    expect(found!.lines[0].serviceId).toBe(SERVICE_ID);
    expect(found!.lines[0].serviceNameAtBooking).toBe('Lavagem Completa');
    expect(found!.lines[0].priceAtBooking.amount.toNumber()).toBe(150);
    expect(found!.lines[0].durationMinsAtBooking).toBe(60);
    expect(found!.lines[0].pointsValueAtBooking).toBe(10);
    expect(found!.lines[0].requiresPickupAddressAtBooking).toBe(true);
    expect(found!.lines[0].actualPriceCharged).toBeNull();
  });

  it('reconstitutes Money with the tenant-configured currency, not a hardcoded BRL default', async () => {
    const tenantId = '00000000-0000-7000-8000-000000000066';
    const defaultSettings = TenantSettings.default().toJSON();
    settingsPort.set(tenantId, {
      ...defaultSettings,
      localization: { ...defaultSettings.localization, currency: 'USD', language: 'en' },
    });

    const svc = new ServiceEntityBuilder().withId(SERVICE_ID_3).withTenantId(tenantId).build();
    await dataSource.getRepository(ServiceEntity).save(svc);

    const booking = new BookingBuilder()
      .withTenantId(tenantId)
      .withTotalPrice(Money.from(100, 'USD'))
      .withLines([
        BookingLine.reconstitute({
          lineId: '00000000-0000-7000-8000-000000000082',
          bookingId: 'placeholder',
          tenantId,
          serviceId: SERVICE_ID_3,
          serviceNameAtBooking: 'Car Wash',
          priceAtBooking: Money.from(100, 'USD'),
          durationMinsAtBooking: 30,
          pointsValueAtBooking: 5,
          requiresPickupAddressAtBooking: false,
          actualPriceCharged: null,
        }),
      ])
      .build();

    await repo.save(booking);

    const found = await repo.findById(booking.id, tenantId);
    expect(found!.totalPrice.currency).toBe('USD');
    expect(found!.lines[0].priceAtBooking.currency).toBe('USD');
  });

  it('updates lines on re-save (delete + re-insert)', async () => {
    const tenantId = '00000000-0000-7000-8000-000000000062';

    // Use a unique service ID to avoid TypeORM UPDATE collision with the beforeAll service
    const svc = new ServiceEntityBuilder().withId(SERVICE_ID_2).withTenantId(tenantId).build();
    await dataSource.getRepository(ServiceEntity).save(svc);

    const booking = new BookingBuilder()
      .withTenantId(tenantId)
      .withLines([
        BookingLine.reconstitute({
          lineId: '00000000-0000-7000-8000-000000000081',
          bookingId: 'placeholder',
          tenantId,
          serviceId: SERVICE_ID_2,
          serviceNameAtBooking: 'Original',
          priceAtBooking: Money.from(100, 'BRL'),
          durationMinsAtBooking: 30,
          pointsValueAtBooking: 1,
          requiresPickupAddressAtBooking: false,
          actualPriceCharged: null,
        }),
      ])
      .withTotalDurationMins(30)
      .withTotalPrice(Money.from(100, 'BRL'))
      .build();

    await repo.save(booking);

    // Approve the booking so we can complete it and set actual price
    const found = await repo.findById(booking.id, tenantId);
    found!.approve('00000000-0000-7000-8000-000000000099', 'corr-1');
    found!.complete(
      '00000000-0000-7000-8000-000000000099',
      new Map([[found!.lines[0].lineId, Money.from(120, 'BRL')]]),
      [],
      'corr-2',
    );
    found!.clearDomainEvents();

    await repo.save(found!);

    const updated = await repo.findById(booking.id, tenantId);
    expect(updated!.status).toBe(BookingStatus.COMPLETED);
    expect(updated!.lines[0].actualPriceCharged!.amount.toNumber()).toBe(120);
  });

  it('findById returns null for wrong tenant (isolation)', async () => {
    const booking = new BookingBuilder().withTenantId(TENANT_A).withLines([]).build();
    await repo.save(booking);

    const result = await repo.findById(booking.id, TENANT_B);
    expect(result).toBeNull();
  });

  it('findAllByTenant returns only bookings for the given tenant', async () => {
    const tenantId = '00000000-0000-7000-8000-000000000063';
    const otherTenant = '00000000-0000-7000-8000-000000000064';

    const b1 = new BookingBuilder().withTenantId(tenantId).withLines([]).build();
    const b2 = new BookingBuilder().withTenantId(tenantId).withLines([]).build();
    const b3 = new BookingBuilder().withTenantId(otherTenant).withLines([]).build();

    await repo.save(b1);
    await repo.save(b2);
    await repo.save(b3);

    const results = await repo.findAllByTenant(tenantId);
    expect(results.every((b) => b.tenantId === tenantId)).toBe(true);
    expect(results.some((b) => b.id === b1.id)).toBe(true);
    expect(results.some((b) => b.id === b2.id)).toBe(true);
    expect(results.some((b) => b.id === b3.id)).toBe(false);
  });

  it('findAllByTenant with status filter returns only matching bookings', async () => {
    const tenantId = '00000000-0000-7000-8000-000000000065';

    const pending = new BookingBuilder().withTenantId(tenantId).withLines([]).build();
    const approved = new BookingBuilder()
      .withTenantId(tenantId)
      .withStatus(BookingStatus.APPROVED)
      .withApprovedAt(new Date())
      .withApprovedBy('00000000-0000-7000-8000-000000000099')
      .withLines([])
      .build();

    await repo.save(pending);
    await repo.save(approved);

    const results = await repo.findAllByTenant(tenantId, { status: BookingStatus.APPROVED });
    expect(results.every((b) => b.status === BookingStatus.APPROVED)).toBe(true);
    expect(results.some((b) => b.id === approved.id)).toBe(true);
    expect(results.some((b) => b.id === pending.id)).toBe(false);
  });
});
