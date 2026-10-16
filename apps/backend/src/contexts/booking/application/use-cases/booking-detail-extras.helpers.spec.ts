import { InMemoryBookingStaffPort } from '../../../../test/infrastructure/in-memory-booking-staff.port';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { BookingBuilder, BookingLineBuilder } from '../../../../test/builders/booking/index';
import { ServiceBuilder } from '../../../../test/builders/booking/service.builder';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { InMemoryResourceOccupancyRepository } from '../../../../test/repositories/booking/in-memory-resource-occupancy.repository';
import { InMemoryServiceIntakeSchemaRepository } from '../../../../test/repositories/booking/in-memory-service-intake-schema.repository';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { Booking, BookingStatus } from '../../domain/booking.aggregate';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import { ServiceBookingIntakeSchema } from '../../domain/service-booking-intake-schema';
import { ServiceLeg } from '../../domain/service-leg';
import {
  BookingDetailExtrasDeps,
  buildIntakeDetail,
  pickBookedIntakeSchemas,
  EMPTY_BOOKING_DETAIL_EXTRAS,
  loadBookingDetailExtras,
} from './booking-detail-extras.helpers';

const TENANT = '10000000-0000-4000-8000-000000000481';
const CUSTOMER_ID = '20000000-0000-4000-8000-000000000481';
const STAFF_ID = '20000000-0000-4000-8000-000000000482';
const OTHER_STAFF_ID = '20000000-0000-4000-8000-000000000483';
const LINE_ID = '30000000-0000-4000-8000-000000000481';

function schemaV(
  version: number,
  labels: Record<string, string>,
  createdAt = new Date('2026-06-01T00:00:00.000Z'),
  serviceId = 'svc-1',
): ServiceBookingIntakeSchema {
  return ServiceBookingIntakeSchema.reconstitute({
    id: `schema-${version}`,
    tenantId: TENANT,
    serviceId,
    version,
    questions: Object.entries(labels).map(([fieldKey, label]) => ({
      fieldKey,
      label,
      type: 'FREE_TEXT' as const,
      required: false,
    })),
    consentText: 'Termo',
    consentVersion: version,
    requiresNamedAttendees: false,
    participantCountRequired: false,
    isActive: version === 2,
    createdAt,
  });
}

describe('buildIntakeDetail', () => {
  const booking = (intake: Booking['intake']) =>
    new BookingBuilder().withTenantId(TENANT).withIntake(intake).build();

  it('is null for a booking without an intake', () => {
    expect(buildIntakeDetail(booking(null), [schemaV(1, { a: 'A' })])).toBeNull();
  });

  it('labels answers with the booked version and orders them like its questions', () => {
    const result = buildIntakeDetail(
      booking({
        intakeSchemaVersion: 1,
        intakeAnswers: { second: 'dois', first: 'um' },
        consentAcceptedAt: new Date('2026-06-10T14:02:00.000Z'),
        consentVersion: 1,
      }),
      [schemaV(1, { first: 'Primeira', second: 'Segunda' }), schemaV(2, { first: 'Nova' })],
    );

    expect(result?.answers.map((a) => [a.fieldKey, a.label])).toEqual([
      ['first', 'Primeira'],
      ['second', 'Segunda'],
    ]);
    expect(result).toMatchObject({
      schemaVersion: 1,
      consentAcceptedAt: '2026-06-10T14:02:00.000Z',
      consentVersion: 1,
    });
  });

  it('keeps an answer whose key the version lacks, last, labelled by its key and typed by its value', () => {
    const result = buildIntakeDetail(
      booking({
        intakeSchemaVersion: 1,
        intakeAnswers: { gone: true, first: 'um' },
        consentAcceptedAt: null,
        consentVersion: null,
      }),
      [schemaV(1, { first: 'Primeira' })],
    );

    expect(result?.answers).toEqual([
      { fieldKey: 'first', label: 'Primeira', type: 'FREE_TEXT', value: 'um' },
      { fieldKey: 'gone', label: 'gone', type: 'BOOLEAN', value: true },
    ]);
    expect(result).toMatchObject({ consentAcceptedAt: null, consentVersion: null });
  });

  it('falls back to the keys when the booked version no longer exists at all', () => {
    const result = buildIntakeDetail(
      booking({
        intakeSchemaVersion: 9,
        intakeAnswers: { first: 'um' },
        consentAcceptedAt: null,
        consentVersion: null,
      }),
      [schemaV(1, { first: 'Primeira' })],
    );

    expect(result?.answers[0]).toMatchObject({ fieldKey: 'first', label: 'first' });
  });
});

describe('pickBookedIntakeSchemas', () => {
  const booking = new BookingBuilder()
    .withTenantId(TENANT)
    .withIntake({
      intakeSchemaVersion: 2,
      intakeAnswers: {},
      consentAcceptedAt: null,
      consentVersion: null,
    })
    .build();
  const later = new Date('2099-01-01T00:00:00.000Z');

  it('picks the service whose booked version was its newest at booking time', () => {
    const owner = [schemaV(1, { a: 'A' }), schemaV(2, { a: 'A2' })];
    const other = [schemaV(1, { b: 'B' })];

    expect(pickBookedIntakeSchemas(booking, [other, owner])).toBe(owner);
  });

  it('ignores a same-numbered version another service published after the booking', () => {
    const owner = [schemaV(1, { a: 'A' }), schemaV(2, { a: 'A2' })];
    const decoy = [schemaV(1, { b: 'B' }), schemaV(2, { b: 'B2' }, later)];

    expect(pickBookedIntakeSchemas(booking, [decoy, owner])).toBe(owner);
  });

  it('picks nothing when no service had that version', () => {
    expect(pickBookedIntakeSchemas(booking, [[schemaV(1, { a: 'A' })]])).toEqual([]);
  });
});

describe('loadBookingDetailExtras', () => {
  let bookingRepo: InMemoryBookingRepository;
  let serviceRepo: InMemoryServiceRepository;
  let occupancyRepo: InMemoryResourceOccupancyRepository;
  let staffPort: InMemoryBookingStaffPort;
  let deps: BookingDetailExtrasDeps;

  beforeEach(() => {
    bookingRepo = new InMemoryBookingRepository();
    serviceRepo = new InMemoryServiceRepository();
    occupancyRepo = new InMemoryResourceOccupancyRepository();
    staffPort = new InMemoryBookingStaffPort();
    deps = {
      bookingRepo,
      serviceRepo,
      occupancyRepo,
      intakeSchemaRepo: new InMemoryServiceIntakeSchemaRepository(),
      staffPort,
      txManager: new InMemoryTransactionManager(),
    };
  });

  async function seed(
    options: { customerId?: string | null; leggedService?: boolean } = {},
  ): Promise<Booking> {
    const van = ResourceRequirement.create({
      type: ResourceType.EQUIPMENT,
      selectionMode: 'AUTO_ANY',
    });
    const service = options.leggedService
      ? new ServiceBuilder()
          .withTenantId(TENANT)
          .withLegs([
            ServiceLeg.create({
              legIndex: 0,
              name: 'Ida',
              durationMinutes: 40,
              resourceRequirements: [van],
            }),
          ])
          .build()
      : new ServiceBuilder().withTenantId(TENANT).build();
    await serviceRepo.save(service);
    const line = new BookingLineBuilder()
      .withLineId(LINE_ID)
      .withTenantId(TENANT)
      .withServiceId(service.id)
      .build();
    const booking = new BookingBuilder()
      .withTenantId(TENANT)
      .withCustomerId(options.customerId === undefined ? CUSTOMER_ID : options.customerId)
      .withStatus(BookingStatus.APPROVED)
      .withLines([line])
      .build();
    await bookingRepo.save(booking);
    return booking;
  }

  const legAssignment = {
    bookingLineId: LINE_ID,
    resourceId: 'van-1',
    resourceType: ResourceType.EQUIPMENT,
    resourceName: 'Van 1',
    legIndex: 0,
    quantityPosition: null,
  };

  const occupancyCandidate = {
    resourceId: 'van-1',
    resourceType: ResourceType.EQUIPMENT,
    resourceName: 'Van 1',
    legIndex: 0,
    quantityPosition: null,
    startsAt: new Date('2026-06-16T09:00:00.000Z'),
    endsAt: new Date('2026-06-16T09:40:00.000Z'),
    gapMinutes: null,
    gapSource: null,
    selectionMode: 'AUTO_ANY' as const,
    isBundleMember: false,
  };

  it('gives a legged live booking its leg times from the occupancy rows', async () => {
    const booking = await seed({ leggedService: true });
    bookingRepo.setLatestResourceAssignments(booking.id, [legAssignment]);
    occupancyRepo.seed(TENANT, LINE_ID, occupancyCandidate);

    const extras = await loadBookingDetailExtras(deps, booking, { includeActorNames: false });

    expect(extras.itinerary).toEqual([
      expect.objectContaining({
        legIndex: 0,
        legName: 'Ida',
        startsAt: '2026-06-16T09:00:00.000Z',
        endsAt: '2026-06-16T09:40:00.000Z',
      }),
    ]);
  });

  it('keeps the legs of a cancelled booking but never reads occupancy, so the times are null', async () => {
    const booking = await seed({ leggedService: true });
    booking.cancel({ type: 'CUSTOMER', id: CUSTOMER_ID }, 'corr-1');
    await bookingRepo.save(booking);
    bookingRepo.setLatestResourceAssignments(booking.id, [legAssignment]);
    occupancyRepo.seed(TENANT, LINE_ID, occupancyCandidate);
    const read = jest.spyOn(occupancyRepo, 'findOccupancyByBookingLines');

    const extras = await loadBookingDetailExtras(deps, booking, { includeActorNames: false });

    expect(read).not.toHaveBeenCalled();
    expect(extras.itinerary).toEqual([expect.objectContaining({ startsAt: null, endsAt: null })]);
  });

  it('does not read occupancy when no assignment is on a leg', async () => {
    const booking = await seed();
    const read = jest.spyOn(occupancyRepo, 'findOccupancyByBookingLines');

    await loadBookingDetailExtras(deps, booking, { includeActorNames: false });

    expect(read).not.toHaveBeenCalled();
  });

  describe('actor names', () => {
    it('does not look up the booking customer as staff, and makes no call when only the customer acted', async () => {
      const booking = await seed();
      booking.cancel({ type: 'CUSTOMER', id: CUSTOMER_ID }, 'corr-1');
      await bookingRepo.save(booking);
      const names = jest.spyOn(staffPort, 'findNamesByIds');

      const extras = await loadBookingDetailExtras(deps, booking, { includeActorNames: true });

      expect(names).not.toHaveBeenCalled();
      expect(extras.cancellation).toMatchObject({
        byCustomer: true,
        actorId: CUSTOMER_ID,
        actorName: booking.contactName,
      });
    });

    it('asks once for the creator and the cancelling staff member together, without duplicates', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT)
        .withCustomerId(CUSTOMER_ID)
        .withStatus(BookingStatus.APPROVED)
        .withCreatedByStaffId(STAFF_ID)
        .build();
      booking.cancel({ type: 'STAFF', id: STAFF_ID }, 'corr-1', 'Chuva');
      staffPort.setName(TENANT, STAFF_ID, 'Ana Pereira');
      const names = jest.spyOn(staffPort, 'findNamesByIds');

      const extras = await loadBookingDetailExtras(deps, booking, { includeActorNames: true });

      expect(names).toHaveBeenCalledTimes(1);
      expect(names).toHaveBeenCalledWith([STAFF_ID], TENANT);
      expect(extras).toMatchObject({
        createdByName: 'Ana Pereira',
        cancellation: { byCustomer: false, actorName: 'Ana Pereira', reason: 'Chuva' },
      });
    });

    it('does not resolve names at all for a read that did not ask (customer read)', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT)
        .withCustomerId(CUSTOMER_ID)
        .withStatus(BookingStatus.APPROVED)
        .withCreatedByStaffId(STAFF_ID)
        .build();
      booking.cancel({ type: 'STAFF', id: OTHER_STAFF_ID }, 'corr-1');
      const names = jest.spyOn(staffPort, 'findNamesByIds');

      const extras = await loadBookingDetailExtras(deps, booking, { includeActorNames: false });

      expect(names).not.toHaveBeenCalled();
      expect(extras.createdByName).toBeNull();
      expect(extras.cancellation).toMatchObject({ actorId: OTHER_STAFF_ID, actorName: null });
    });

    it('treats a staff actor on a guest booking (no customer) as staff', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT)
        .withCustomerId(null)
        .withStatus(BookingStatus.APPROVED)
        .build();
      booking.cancel({ type: 'STAFF', id: STAFF_ID }, 'corr-1');
      staffPort.setName(TENANT, STAFF_ID, 'Ana Pereira');

      const extras = await loadBookingDetailExtras(deps, booking, { includeActorNames: true });

      expect(extras.cancellation).toMatchObject({ byCustomer: false, actorName: 'Ana Pereira' });
    });
  });

  it('labels the intake of a multi-service basket from the service that owns it, not the first line', async () => {
    const first = new ServiceBuilder().withTenantId(TENANT).build();
    const second = new ServiceBuilder().withTenantId(TENANT).build();
    await serviceRepo.save(first);
    await serviceRepo.save(second);
    const schemaRepo = new InMemoryServiceIntakeSchemaRepository();
    await schemaRepo.publish(schemaV(1, { plate: 'Placa' }, undefined, second.id));
    deps.intakeSchemaRepo = schemaRepo;
    const read = jest.spyOn(schemaRepo, 'findAllByServiceIds');
    const lines = [first, second].map((service, index) =>
      new BookingLineBuilder()
        .withLineId(`3000000${index}-0000-4000-8000-000000000481`)
        .withTenantId(TENANT)
        .withServiceId(service.id)
        .build(),
    );
    const booking = new BookingBuilder()
      .withTenantId(TENANT)
      .withLines(lines)
      .withIntake({
        intakeSchemaVersion: 1,
        intakeAnswers: { plate: 'ABC1D23' },
        consentAcceptedAt: null,
        consentVersion: null,
      })
      .build();

    const extras = await loadBookingDetailExtras(deps, booking, { includeActorNames: false });

    expect(extras.intake?.answers).toEqual([
      { fieldKey: 'plate', label: 'Placa', type: 'FREE_TEXT', value: 'ABC1D23' },
    ]);
    // One intake query for the whole basket, not one per service.
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('exposes an empty, all-null shape for a read that did not ask for extras', () => {
    expect(Object.values(EMPTY_BOOKING_DETAIL_EXTRAS).every((value) => value === null)).toBe(true);
  });
});
