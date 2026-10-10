import { DataSource } from 'typeorm';
import { createTestDataSource } from '../../../../test/test-datasource';
import {
  BookingBuilder,
  BookingStatusTransitionEntityBuilder,
  ServiceEntityBuilder,
} from '../../../../test/builders/booking/index';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTenantSettingsPort } from '../../../../test/infrastructure/in-memory-tenant-settings.port';
import { TypeOrmTransactionManager } from '../../../../shared/infrastructure/typeorm-transaction-manager';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { Money } from '../../../../shared/value-objects/money';
import { Booking, BookingStatus } from '../../domain/booking.aggregate';
import { BookingLine } from '../../domain/booking-line.entity';
import { IdentifiedBookingActor, StaffBookingActor } from '../../domain/booking-status-transition';
import { BookingEntity } from '../entities/booking.entity';
import { BookingAttendeeEntity } from '../entities/booking-attendee.entity';
import { BookingLineEntity } from '../entities/booking-line.entity';
import { BookingLineResourceAssignmentEntity } from '../entities/booking-line-resource-assignment.entity';
import { BookingStatusTransitionEntity } from '../entities/booking-status-transition.entity';
import { ServiceEntity } from '../entities/service.entity';
import { TypeOrmBookingRepository } from './typeorm-booking.repository';
import { TypeOrmBookingStatusTransitionRepository } from './typeorm-booking-status-transition.repository';

const TENANT_A = uuidv7();
const TENANT_B = uuidv7();
const SERVICE_ID = uuidv7();
const STAFF: StaffBookingActor = { type: 'STAFF', id: uuidv7() };
const MANAGER: StaffBookingActor = { type: 'MANAGER', id: uuidv7() };
const CUSTOMER: IdentifiedBookingActor = { type: 'CUSTOMER', id: uuidv7() };

describe('Booking status transitions (integration)', () => {
  let dataSource: DataSource;
  let txManager: TypeOrmTransactionManager;
  let bookingRepo: TypeOrmBookingRepository;

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    txManager = new TypeOrmTransactionManager(dataSource);
    bookingRepo = new TypeOrmBookingRepository(
      dataSource.getRepository(BookingEntity),
      dataSource.getRepository(BookingLineEntity),
      dataSource.getRepository(BookingAttendeeEntity),
      dataSource.getRepository(BookingLineResourceAssignmentEntity),
      new InMemoryTenantSettingsPort(),
      new InMemoryEventBus(),
      new TypeOrmBookingStatusTransitionRepository(
        dataSource.getRepository(BookingStatusTransitionEntity),
      ),
    );
    await dataSource
      .getRepository(ServiceEntity)
      .save(new ServiceEntityBuilder().withId(SERVICE_ID).withTenantId(TENANT_A).build());
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  async function saveBooking(status: BookingStatus): Promise<Booking> {
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withStatus(status)
      .withScheduledAt(new Date('2026-06-01T13:00:00.000Z'))
      .withTotalDurationMins(30)
      .withTotalPrice(Money.from(100, 'BRL'))
      .withLines([
        BookingLine.reconstitute({
          lineId: uuidv7(),
          bookingId: 'placeholder',
          tenantId: TENANT_A,
          serviceId: SERVICE_ID,
          serviceNameAtBooking: 'Lavagem Simples',
          priceAtBooking: Money.from(100, 'BRL'),
          durationMinsAtBooking: 30,
          pointsValueAtBooking: 10,
          requiresPickupAddressAtBooking: false,
          actualPriceCharged: null,
        }),
      ])
      .build();
    await bookingRepo.save(booking);
    return booking;
  }

  const save = (booking: Booking) => txManager.run(() => bookingRepo.save(booking));

  const rowsFor = (tenantId: string, bookingId: string) =>
    dataSource
      .getRepository(BookingStatusTransitionEntity)
      .find({ where: { tenantId, bookingId }, order: { occurredAt: 'ASC', id: 'ASC' } });

  const shape = (rows: BookingStatusTransitionEntity[]) =>
    rows.map((r) => [r.fromStatus, r.toStatus, r.actorType]);

  it('writes no row when a booking is created, whatever its initial status', async () => {
    const pending = await saveBooking(BookingStatus.PENDING);
    const approved = await saveBooking(BookingStatus.APPROVED);

    expect(await rowsFor(TENANT_A, pending.id)).toEqual([]);
    expect(await rowsFor(TENANT_A, approved.id)).toEqual([]);
  });

  it('persists the approval with its actor and no reason', async () => {
    const booking = await saveBooking(BookingStatus.PENDING);
    const correlationId = uuidv7();

    booking.approve(MANAGER, correlationId);
    await save(booking);

    const [row] = await rowsFor(TENANT_A, booking.id);
    expect(row).toMatchObject({
      fromStatus: 'PENDING',
      toStatus: 'APPROVED',
      actorType: 'MANAGER',
      actorId: MANAGER.id,
      reason: null,
      correlationId,
    });
  });

  it('persists the rejection reason', async () => {
    const booking = await saveBooking(BookingStatus.INFO_REQUESTED);

    booking.reject(STAFF, 'Serviço indisponível nessa data', uuidv7());
    await save(booking);

    expect(await rowsFor(TENANT_A, booking.id)).toMatchObject([
      {
        fromStatus: 'INFO_REQUESTED',
        toStatus: 'REJECTED',
        actorType: 'STAFF',
        reason: 'Serviço indisponível nessa data',
      },
    ]);
  });

  it('persists a long reject or cancel reason (the column holds as much as the booking does)', async () => {
    const rejected = await saveBooking(BookingStatus.PENDING);
    const cancelled = await saveBooking(BookingStatus.APPROVED);
    const longReason = 'x'.repeat(2_000);

    rejected.reject(STAFF, longReason, uuidv7());
    cancelled.cancel(STAFF, uuidv7(), longReason);
    await save(rejected);
    await save(cancelled);

    expect((await rowsFor(TENANT_A, rejected.id))[0].reason).toBe(longReason);
    expect((await rowsFor(TENANT_A, cancelled.id))[0].reason).toBe(longReason);
  });

  it.each([BookingStatus.PENDING, BookingStatus.INFO_REQUESTED, BookingStatus.APPROVED])(
    'records the from-status when a customer cancels from %s',
    async (from) => {
      const booking = await saveBooking(from);

      booking.cancel(CUSTOMER, uuidv7());
      await save(booking);

      expect(shape(await rowsFor(TENANT_A, booking.id))).toEqual([[from, 'CANCELLED', 'CUSTOMER']]);
    },
  );

  it('yields four ordered rows across a full information-request lifecycle', async () => {
    const booking = await saveBooking(BookingStatus.PENDING);
    const staffMessage = 'Por favor envie uma foto do veículo';

    booking.requestMoreInfo(STAFF, staffMessage, uuidv7());
    await save(booking);
    booking.submitInformation('cliente@teste.com', { notes: 'Segue a foto' }, uuidv7(), CUSTOMER);
    await save(booking);
    booking.approve(MANAGER, uuidv7());
    await save(booking);
    booking.complete(STAFF, new Map(), [], uuidv7());
    await save(booking);

    const rows = await rowsFor(TENANT_A, booking.id);
    expect(shape(rows)).toEqual([
      ['PENDING', 'INFO_REQUESTED', 'STAFF'],
      ['INFO_REQUESTED', 'PENDING', 'CUSTOMER'],
      ['PENDING', 'APPROVED', 'MANAGER'],
      ['APPROVED', 'COMPLETED', 'STAFF'],
    ]);
    expect(rows.map((r) => r.reason)).toEqual([staffMessage, null, null, null]);
  });

  it('records a guest reply with no actor id', async () => {
    const booking = await saveBooking(BookingStatus.INFO_REQUESTED);

    booking.submitInformation('guest@teste.com', {}, uuidv7(), { type: 'GUEST', id: null });
    await save(booking);

    expect(await rowsFor(TENANT_A, booking.id)).toMatchObject([
      { fromStatus: 'INFO_REQUESTED', toStatus: 'PENDING', actorType: 'GUEST', actorId: null },
    ]);
  });

  it('persists the no-show and its correction with the booking, ordered and tenant-scoped', async () => {
    const booking = await saveBooking(BookingStatus.APPROVED);

    booking.markNoShow(STAFF, uuidv7(), 'Cliente não atendeu o telefone.', new Date());
    await save(booking);
    booking.correctNoShow(MANAGER, uuidv7(), 'Cliente chegou atrasado e foi atendido.');
    await save(booking);

    const rows = await rowsFor(TENANT_A, booking.id);
    expect(shape(rows)).toEqual([
      ['APPROVED', 'NO_SHOW', 'STAFF'],
      ['NO_SHOW', 'COMPLETED', 'MANAGER'],
    ]);
    expect(rows.map((r) => r.reason)).toEqual([
      'Cliente não atendeu o telefone.',
      'Cliente chegou atrasado e foi atendido.',
    ]);
    expect((await bookingRepo.findById(booking.id, TENANT_A))!.status).toBe(
      BookingStatus.COMPLETED,
    );
    expect(await rowsFor(TENANT_B, booking.id)).toEqual([]);
  });

  it("reads one booking's history in order and never another booking's or tenant's", async () => {
    const transitionRepo = new TypeOrmBookingStatusTransitionRepository(
      dataSource.getRepository(BookingStatusTransitionEntity),
    );
    const booking = await saveBooking(BookingStatus.APPROVED);
    const other = await saveBooking(BookingStatus.APPROVED);
    booking.markNoShow(STAFF, uuidv7(), 'Cliente não atendeu.', new Date());
    await save(booking);
    booking.correctNoShow(MANAGER, uuidv7(), 'Cliente chegou atrasado e foi atendido.');
    await save(booking);
    other.cancel(STAFF, uuidv7());
    await save(other);

    const history = await transitionRepo.findByBooking(TENANT_A, booking.id);

    expect(history.map((t) => [t.fromStatus, t.toStatus, t.actorType])).toEqual([
      ['APPROVED', 'NO_SHOW', 'STAFF'],
      ['NO_SHOW', 'COMPLETED', 'MANAGER'],
    ]);
    expect(await transitionRepo.findByBooking(TENANT_B, booking.id)).toEqual([]);
  });

  it('saves an untouched booking without adding a row', async () => {
    const booking = await saveBooking(BookingStatus.PENDING);
    booking.approve(STAFF, uuidv7());
    await save(booking);

    await save(booking);

    expect(await rowsFor(TENANT_A, booking.id)).toHaveLength(1);
  });

  it('rolls the audit row back with the booking when the transaction fails', async () => {
    const booking = await saveBooking(BookingStatus.APPROVED);
    booking.markNoShow(STAFF, uuidv7(), undefined, new Date());

    await expect(
      txManager.run(async () => {
        await bookingRepo.save(booking);
        throw new Error('boom after the save');
      }),
    ).rejects.toThrow('boom after the save');

    expect(await rowsFor(TENANT_A, booking.id)).toEqual([]);
    expect((await bookingRepo.findById(booking.id, TENANT_A))!.status).toBe(BookingStatus.APPROVED);
  });

  it("rejects a transition that points at another tenant's booking (composite FK)", async () => {
    const booking = await saveBooking(BookingStatus.APPROVED);
    const crossTenantRow = new BookingStatusTransitionEntityBuilder()
      .withTenantId(TENANT_B)
      .withBookingId(booking.id)
      .build();

    await expect(
      dataSource.getRepository(BookingStatusTransitionEntity).insert(crossTenantRow),
    ).rejects.toThrow(/foreign key|violates/i);
  });
});
