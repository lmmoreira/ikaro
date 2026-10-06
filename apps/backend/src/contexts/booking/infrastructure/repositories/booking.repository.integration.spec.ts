import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { createTestDataSource } from '../../../../test/test-datasource';
import {
  BookingBuilder,
  BookingLineInputBuilder,
  RecurringBookingScheduleEntityBuilder,
  ServiceEntityBuilder,
} from '../../../../test/builders/booking/index';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTenantSettingsPort } from '../../../../test/infrastructure/in-memory-tenant-settings.port';
import { testAddress } from '../../../../test/utils/address-helpers';
import { Money } from '../../../../shared/value-objects/money';
import { TenantSettings } from '../../../platform/domain/value-objects/tenant-settings.vo';
import { Booking, BookingStatus } from '../../domain/booking.aggregate';
import { BookingLine } from '../../domain/booking-line.entity';
import { BookingConcurrentModificationError } from '../../domain/errors/booking-domain.error';
import { ServiceEntity } from '../entities/service.entity';
import { RecurringBookingScheduleEntity } from '../entities/recurring-booking-schedule.entity';
import { BookingEntity } from '../entities/booking.entity';
import { BookingAttendeeEntity } from '../entities/booking-attendee.entity';
import { BookingLineEntity } from '../entities/booking-line.entity';
import { BookingLineResourceAssignmentEntity } from '../entities/booking-line-resource-assignment.entity';
import { TypeOrmTransactionManager } from '../../../../shared/infrastructure/typeorm-transaction-manager';
import { TypeOrmBookingRepository } from './typeorm-booking.repository';
import { BookingStatusTransitionEntity } from '../entities/booking-status-transition.entity';
import { TypeOrmBookingStatusTransitionRepository } from './typeorm-booking-status-transition.repository';

const TENANT_A = '00000000-0000-7000-8000-000000000060';
const TENANT_B = '00000000-0000-7000-8000-000000000061';
const SERVICE_ID = '00000000-0000-7000-8000-000000000070';
const SERVICE_ID_2 = '00000000-0000-7000-8000-000000000071';
const SERVICE_ID_3 = '00000000-0000-7000-8000-000000000072';

describe('TypeOrmBookingRepository (integration)', () => {
  let dataSource: DataSource;
  let repo: TypeOrmBookingRepository;
  let settingsPort: InMemoryTenantSettingsPort;
  let txManager: TypeOrmTransactionManager;

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    txManager = new TypeOrmTransactionManager(dataSource);
    settingsPort = new InMemoryTenantSettingsPort();
    repo = new TypeOrmBookingRepository(
      dataSource.getRepository(BookingEntity),
      dataSource.getRepository(BookingLineEntity),
      dataSource.getRepository(BookingAttendeeEntity),
      dataSource.getRepository(BookingLineResourceAssignmentEntity),
      settingsPort,
      new InMemoryEventBus(),
      new TypeOrmBookingStatusTransitionRepository(
        dataSource.getRepository(BookingStatusTransitionEntity),
      ),
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
      .withNotes('Favor chegar com 10 minutos de antecedência')
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
    expect(found!.notes).toBe('Favor chegar com 10 minutos de antecedência');
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

  it('persists updated line values while preserving existing line ids', async () => {
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
    found!.approve({ type: 'STAFF', id: '00000000-0000-7000-8000-000000000099' }, uuidv7());
    found!.complete(
      { type: 'STAFF', id: '00000000-0000-7000-8000-000000000099' },
      new Map([[found!.lines[0].lineId, Money.from(120, 'BRL')]]),
      [],
      uuidv7(),
    );
    found!.clearDomainEvents();

    await repo.save(found!);

    const updated = await repo.findById(booking.id, tenantId);
    expect(updated!.status).toBe(BookingStatus.COMPLETED);
    expect(updated!.lines[0].lineId).toBe('00000000-0000-7000-8000-000000000081');
    expect(updated!.lines[0].actualPriceCharged!.amount.toNumber()).toBe(120);

    const storedLines = await dataSource.getRepository(BookingLineEntity).find({
      where: { bookingId: booking.id, tenantId },
    });
    expect(storedLines).toHaveLength(1);
    expect(storedLines[0].lineId).toBe('00000000-0000-7000-8000-000000000081');
    expect(storedLines[0].actualPriceChargedAmount).toBe('120.00');
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

    const results = await repo.findAllByTenant(tenantId, { status: [BookingStatus.APPROVED] });
    expect(results.every((b) => b.status === BookingStatus.APPROVED)).toBe(true);
    expect(results.some((b) => b.id === approved.id)).toBe(true);
    expect(results.some((b) => b.id === pending.id)).toBe(false);
  });

  it('throws BookingConcurrentModificationError when saving a stale loaded aggregate', async () => {
    const tenantId = '00000000-0000-7000-8000-000000000067';
    const serviceId = '00000000-0000-7000-8000-000000000083';
    await dataSource
      .getRepository(ServiceEntity)
      .save(new ServiceEntityBuilder().withId(serviceId).withTenantId(tenantId).build());

    const booking = new BookingBuilder()
      .withTenantId(tenantId)
      .withLines([
        BookingLine.reconstitute({
          lineId: '00000000-0000-7000-8000-000000000084',
          bookingId: 'placeholder',
          tenantId,
          serviceId,
          serviceNameAtBooking: 'Lavagem Completa',
          priceAtBooking: Money.from(100, 'BRL'),
          durationMinsAtBooking: 30,
          pointsValueAtBooking: 10,
          requiresPickupAddressAtBooking: false,
          actualPriceCharged: null,
        }),
      ])
      .build();

    await repo.save(booking);

    const copyA = await repo.findById(booking.id, tenantId);
    const copyB = await repo.findById(booking.id, tenantId);
    expect(copyA).not.toBeNull();
    expect(copyB).not.toBeNull();

    copyA!.approve({ type: 'STAFF', id: '00000000-0000-7000-8000-000000000099' }, uuidv7());
    copyB!.approve({ type: 'STAFF', id: '00000000-0000-7000-8000-000000000099' }, uuidv7());

    await repo.save(copyA!);

    await expect(repo.save(copyB!)).rejects.toBeInstanceOf(BookingConcurrentModificationError);
  });

  describe('findByIds (M23-S08)', () => {
    it('loads exactly the requested bookings of the tenant, with their lines', async () => {
      const tenantId = '00000000-0000-7000-8000-000000000066';
      const first = new BookingBuilder().withTenantId(tenantId).withLines([]).build();
      const second = new BookingBuilder().withTenantId(tenantId).withLines([]).build();
      const notRequested = new BookingBuilder().withTenantId(tenantId).withLines([]).build();
      await repo.save(first);
      await repo.save(second);
      await repo.save(notRequested);

      const results = await repo.findByIds([first.id, second.id], tenantId);

      expect(results.map((b) => b.id).sort()).toEqual([first.id, second.id].sort());
    });

    it('never returns a booking of another tenant, and returns nothing for no ids', async () => {
      const tenantId = '00000000-0000-7000-8000-000000000067';
      const other = new BookingBuilder()
        .withTenantId('00000000-0000-7000-8000-000000000068')
        .withLines([])
        .build();
      await repo.save(other);

      expect(await repo.findByIds([other.id], tenantId)).toEqual([]);
      expect(await repo.findByIds([], tenantId)).toEqual([]);
    });
  });

  describe('recurringScheduleId list filter (M23-S08)', () => {
    it("lists only that schedule's occurrence bookings", async () => {
      const tenantId = TENANT_A;
      const schedules = await dataSource
        .getRepository(RecurringBookingScheduleEntity)
        .save([
          new RecurringBookingScheduleEntityBuilder()
            .withTenantId(tenantId)
            .withServiceId(SERVICE_ID)
            .build(),
          new RecurringBookingScheduleEntityBuilder()
            .withTenantId(tenantId)
            .withServiceId(SERVICE_ID)
            .build(),
        ]);
      const occurrence = new BookingBuilder()
        .withTenantId(tenantId)
        .withRecurringScheduleId(schedules[0].id)
        .withLines([])
        .build();
      const siblingSchedule = new BookingBuilder()
        .withTenantId(tenantId)
        .withRecurringScheduleId(schedules[1].id)
        .withLines([])
        .build();
      const oneOff = new BookingBuilder().withTenantId(tenantId).withLines([]).build();
      await repo.save(occurrence);
      await repo.save(siblingSchedule);
      await repo.save(oneOff);

      const page = await repo.findAllByTenantPaginated(tenantId, {
        limit: 25,
        offset: 0,
        recurringScheduleId: schedules[0].id,
      });

      expect(page.items.map((b) => b.id)).toEqual([occurrence.id]);
      expect(page.total).toBe(1);

      // The bookings reference the schedules by FK, so they go first — this spec shares a fixed
      // tenant with the others and must not leave rows behind.
      await dataSource
        .getRepository(BookingEntity)
        .delete([occurrence.id, siblingSchedule.id, oneOff.id]);
      await dataSource
        .getRepository(RecurringBookingScheduleEntity)
        .delete(schedules.map((sc) => sc.id));
    });
  });

  describe('insertMany (M23-S05, a recurring term in bulk)', () => {
    async function seedSchedule(): Promise<string> {
      const schedule = await dataSource
        .getRepository(RecurringBookingScheduleEntity)
        .save(
          new RecurringBookingScheduleEntityBuilder()
            .withTenantId(TENANT_A)
            .withServiceId(SERVICE_ID)
            .build(),
        );
      return schedule.id;
    }

    function occurrence(recurringScheduleId: string, day: number): Booking {
      return Booking.materializeRecurringOccurrence({
        tenantId: TENANT_A,
        customerId: '00000000-0000-7000-8000-000000000090',
        contactEmail: 'ana@example.com',
        contactName: 'Ana Souza',
        contactPhone: '+5531999999999',
        scheduledAt: new Date(Date.UTC(2026, 7, day, 13)),
        lineInputs: [
          new BookingLineInputBuilder()
            .withServiceId(SERVICE_ID)
            .withDurationMinsAtBooking(60)
            .withPriceAtBooking(Money.from(150, 'BRL'))
            .build(),
        ],
        recurringScheduleId,
        approvedBy: null,
      });
    }

    async function cleanUp(bookings: Booking[], scheduleId: string): Promise<void> {
      await dataSource
        .getRepository(BookingLineEntity)
        .delete(bookings.map((b) => ({ bookingId: b.id, tenantId: TENANT_A })));
      await dataSource.getRepository(BookingEntity).delete(bookings.map((b) => b.id));
      await dataSource.getRepository(RecurringBookingScheduleEntity).delete(scheduleId);
    }

    it('inserts every booking with its lines in one call and reads them back APPROVED', async () => {
      const scheduleId = await seedSchedule();
      const bookings = [1, 8, 15].map((day) => occurrence(scheduleId, day));

      await txManager.run(() => repo.insertMany(bookings));

      const page = await repo.findAllByTenantPaginated(TENANT_A, {
        limit: 25,
        offset: 0,
        recurringScheduleId: scheduleId,
      });
      expect(page.total).toBe(3);
      expect(page.items.every((b) => b.status === BookingStatus.APPROVED)).toBe(true);
      expect(page.items.every((b) => b.lines.length === 1)).toBe(true);
      expect(page.items[0].lines[0].durationMinsAtBooking).toBe(60);
      expect(bookings.every((b) => b.version === 1)).toBe(true);
      await cleanUp(bookings, scheduleId);
    });

    it('does nothing for an empty batch', async () => {
      await expect(txManager.run(() => repo.insertMany([]))).resolves.toBeUndefined();
    });

    it('refuses a booking that was already persisted, or that raises a domain event', async () => {
      const scheduleId = await seedSchedule();
      const persisted = occurrence(scheduleId, 1);
      await txManager.run(() => repo.insertMany([persisted]));
      const requested = Booking.requestBooking({
        tenantId: TENANT_A,
        contactEmail: 'x@example.com',
        contactName: 'X',
        contactPhone: '+5531999999999',
        scheduledAt: new Date(),
        lineInputs: [new BookingLineInputBuilder().withServiceId(SERVICE_ID).build()],
        type: 'GUEST',
        correlationId: 'corr',
      });

      await expect(txManager.run(() => repo.insertMany([persisted]))).rejects.toThrow(
        'only takes new bookings',
      );
      await expect(txManager.run(() => repo.insertMany([requested]))).rejects.toThrow(
        'only takes new bookings',
      );
      await cleanUp([persisted], scheduleId);
    });

    it('rejects a second booking for the same schedule and start (the idempotency key)', async () => {
      const scheduleId = await seedSchedule();
      const first = occurrence(scheduleId, 1);
      await txManager.run(() => repo.insertMany([first]));

      await expect(
        txManager.run(() => repo.insertMany([occurrence(scheduleId, 1)])),
      ).rejects.toThrow();
      await cleanUp([first], scheduleId);
    });

    it('needs an active transaction', async () => {
      const scheduleId = await seedSchedule();

      await expect(repo.insertMany([occurrence(scheduleId, 1)])).rejects.toThrow(
        'requires an active transaction',
      );
      await dataSource.getRepository(RecurringBookingScheduleEntity).delete(scheduleId);
    });
  });
});
