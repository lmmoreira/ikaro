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
import { BookingStatus } from '../../domain/booking.aggregate';
import { BookingLine } from '../../domain/booking-line.entity';
import { BookingStatusTransition } from '../../domain/booking-status-transition';
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
const STAFF_ID = uuidv7();

describe('TypeOrmBookingStatusTransitionRepository (integration)', () => {
  let dataSource: DataSource;
  let txManager: TypeOrmTransactionManager;
  let bookingRepo: TypeOrmBookingRepository;
  let transitionRepo: TypeOrmBookingStatusTransitionRepository;

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
    );
    transitionRepo = new TypeOrmBookingStatusTransitionRepository(
      dataSource.getRepository(BookingStatusTransitionEntity),
    );
    await dataSource
      .getRepository(ServiceEntity)
      .save(new ServiceEntityBuilder().withId(SERVICE_ID).withTenantId(TENANT_A).build());
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  async function saveApprovedBooking() {
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withStatus(BookingStatus.APPROVED)
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

  const rowsFor = (tenantId: string, bookingId: string) =>
    dataSource
      .getRepository(BookingStatusTransitionEntity)
      .find({ where: { tenantId, bookingId }, order: { occurredAt: 'ASC' } });

  it('persists the no-show and its correction with the booking, ordered and tenant-scoped', async () => {
    const booking = await saveApprovedBooking();

    booking.markNoShow(STAFF_ID, uuidv7(), 'Cliente não atendeu o telefone.', new Date());
    await txManager.run(async () => {
      await bookingRepo.save(booking);
      await transitionRepo.save(
        BookingStatusTransition.record({
          tenantId: TENANT_A,
          bookingId: booking.id,
          fromStatus: BookingStatus.APPROVED,
          toStatus: BookingStatus.NO_SHOW,
          reason: 'Cliente não atendeu o telefone.',
          actorType: 'STAFF',
          actorId: STAFF_ID,
          correlationId: uuidv7(),
        }),
      );
    });

    booking.correctNoShow(STAFF_ID, uuidv7());
    await txManager.run(async () => {
      await bookingRepo.save(booking);
      await transitionRepo.save(
        BookingStatusTransition.record({
          tenantId: TENANT_A,
          bookingId: booking.id,
          fromStatus: BookingStatus.NO_SHOW,
          toStatus: BookingStatus.COMPLETED,
          reason: 'Cliente chegou atrasado e foi atendido.',
          actorType: 'MANAGER',
          actorId: STAFF_ID,
          correlationId: uuidv7(),
        }),
      );
    });

    const rows = await rowsFor(TENANT_A, booking.id);
    expect(rows.map((r) => [r.fromStatus, r.toStatus, r.actorType])).toEqual([
      ['APPROVED', 'NO_SHOW', 'STAFF'],
      ['NO_SHOW', 'COMPLETED', 'MANAGER'],
    ]);
    expect(rows[0].reason).toBe('Cliente não atendeu o telefone.');
    expect((await bookingRepo.findById(booking.id, TENANT_A))!.status).toBe(
      BookingStatus.COMPLETED,
    );
    expect(await rowsFor(TENANT_B, booking.id)).toEqual([]);
  });

  it('rolls the audit row back with the booking when the transaction fails', async () => {
    const booking = await saveApprovedBooking();
    booking.markNoShow(STAFF_ID, uuidv7(), undefined, new Date());

    await expect(
      txManager.run(async () => {
        await bookingRepo.save(booking);
        await transitionRepo.save(
          BookingStatusTransition.record({
            tenantId: TENANT_A,
            bookingId: booking.id,
            fromStatus: BookingStatus.APPROVED,
            toStatus: BookingStatus.NO_SHOW,
            actorType: 'STAFF',
            actorId: STAFF_ID,
            correlationId: uuidv7(),
          }),
        );
        throw new Error('boom after both writes');
      }),
    ).rejects.toThrow('boom after both writes');

    expect(await rowsFor(TENANT_A, booking.id)).toEqual([]);
    expect((await bookingRepo.findById(booking.id, TENANT_A))!.status).toBe(BookingStatus.APPROVED);
  });

  it("rejects a transition that points at another tenant's booking (composite FK)", async () => {
    const booking = await saveApprovedBooking();
    const crossTenantRow = new BookingStatusTransitionEntityBuilder()
      .withTenantId(TENANT_B)
      .withBookingId(booking.id)
      .build();

    await expect(
      dataSource.getRepository(BookingStatusTransitionEntity).insert(crossTenantRow),
    ).rejects.toThrow(/foreign key|violates/i);
  });
});
