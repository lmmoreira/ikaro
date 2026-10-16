import { InMemoryBookingStaffPort } from '../../../../test/infrastructure/in-memory-booking-staff.port';
import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { BookingBuilder, BookingLineBuilder } from '../../../../test/builders/booking/index';
import { ServiceBuilder } from '../../../../test/builders/booking/service.builder';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { InMemoryBookingStatusTransitionRepository } from '../../../../test/repositories/booking/in-memory-booking-status-transition.repository';
import { InMemoryFutureCommitmentExceptionRepository } from '../../../../test/repositories/booking/in-memory-future-commitment-exception.repository';
import { InMemoryResourceOccupancyRepository } from '../../../../test/repositories/booking/in-memory-resource-occupancy.repository';
import { InMemoryServiceIntakeSchemaRepository } from '../../../../test/repositories/booking/in-memory-service-intake-schema.repository';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { BookingStatus } from '../../domain/booking.aggregate';
import { BookingAttendee } from '../../domain/booking-attendee.entity';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import { ServiceBookingIntakeSchema } from '../../domain/service-booking-intake-schema';
import { GetBookingByIdUseCase } from './get-booking-by-id.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000471';
const TENANT_B = '10000000-0000-4000-8000-000000000472';
const CUSTOMER_ID = '20000000-0000-4000-8000-000000000471';
const STAFF_ID = '20000000-0000-4000-8000-000000000472';
const LINE_ID = '30000000-0000-4000-8000-000000000471';

describe('GetBookingByIdUseCase — full booking detail (M23-S47)', () => {
  let repo: InMemoryBookingRepository;
  let serviceRepo: InMemoryServiceRepository;
  let occupancyRepo: InMemoryResourceOccupancyRepository;
  let staffPort: InMemoryBookingStaffPort;
  let intakeRepo: InMemoryServiceIntakeSchemaRepository;
  let useCase: GetBookingByIdUseCase;

  beforeEach(() => {
    repo = new InMemoryBookingRepository();
    serviceRepo = new InMemoryServiceRepository();
    occupancyRepo = new InMemoryResourceOccupancyRepository();
    staffPort = new InMemoryBookingStaffPort();
    intakeRepo = new InMemoryServiceIntakeSchemaRepository();
    useCase = new GetBookingByIdUseCase(
      repo,
      new InMemoryStorageService(),
      serviceRepo,
      occupancyRepo,
      new InMemoryTransactionManager(),
      new InMemoryBookingStatusTransitionRepository(),
      staffPort,
      new InMemoryFutureCommitmentExceptionRepository(),
      intakeRepo,
    );
  });

  async function seedBooking(serviceBuilder = new ServiceBuilder().withTenantId(TENANT_A)) {
    const service = serviceBuilder.build();
    await serviceRepo.save(service);
    const line = new BookingLineBuilder()
      .withLineId(LINE_ID)
      .withTenantId(TENANT_A)
      .withServiceId(service.id)
      .build();
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withCustomerId(CUSTOMER_ID)
      .withStatus(BookingStatus.APPROVED)
      .withLines([line])
      .build();
    await repo.save(booking);
    return { booking, service };
  }

  const ask = (bookingId: string, overrides: Record<string, unknown> = {}) =>
    useCase.execute({
      bookingId,
      tenantId: TENANT_A,
      cancellationWindowHours: 48,
      includeDetailExtras: true,
      ...overrides,
    });

  it('adds none of the new data, and runs none of the new reads, unless asked (loyalty read)', async () => {
    const { booking } = await seedBooking();
    const assignments = jest.spyOn(repo, 'findLatestResourceAssignments');
    const names = jest.spyOn(staffPort, 'findNamesByIds');

    const result = await ask(booking.id, { includeDetailExtras: false });

    expect(result).toMatchObject({
      resources: null,
      itinerary: null,
      attendees: null,
      intake: null,
      cancellation: null,
      rejection: null,
      createdByName: null,
    });
    expect(assignments).not.toHaveBeenCalled();
    expect(names).not.toHaveBeenCalled();
  });

  it('returns the latest assignment per slot: a booking moved to another room shows only the current one', async () => {
    const { booking } = await seedBooking(
      new ServiceBuilder().withTenantId(TENANT_A).withResourceRequirements([
        ResourceRequirement.create({
          type: ResourceType.ROOM,
          selectionMode: 'CUSTOMER_CHOICE',
        }),
      ]),
    );
    repo.setLatestResourceAssignments(booking.id, [
      {
        bookingLineId: LINE_ID,
        resourceId: 'room-new',
        resourceType: ResourceType.ROOM,
        resourceName: 'Sala Nova',
        legIndex: null,
        quantityPosition: null,
      },
    ]);

    const result = await ask(booking.id);

    expect(result.resources).toEqual([
      expect.objectContaining({ resourceName: 'Sala Nova', origin: 'CUSTOMER_CHOICE' }),
    ]);
  });

  it('shows a cancelled booking its resources even though the occupancy rows are gone, and skips that read', async () => {
    const { booking } = await seedBooking(
      new ServiceBuilder()
        .withTenantId(TENANT_A)
        .withResourceRequirements([
          ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_ANY' }),
        ]),
    );
    booking.cancel({ type: 'STAFF', id: STAFF_ID }, 'corr-1', 'Equipamento em manutenção');
    await repo.save(booking);
    repo.setLatestResourceAssignments(booking.id, [
      {
        bookingLineId: LINE_ID,
        resourceId: 'room-1',
        resourceType: ResourceType.ROOM,
        resourceName: 'Sala Aurora',
        legIndex: null,
        quantityPosition: null,
      },
    ]);
    const occupancy = jest.spyOn(occupancyRepo, 'findOccupancyByBookingLines');

    const result = await ask(booking.id);

    expect(result.resources).toEqual([expect.objectContaining({ resourceName: 'Sala Aurora' })]);
    expect(occupancy).not.toHaveBeenCalled();
  });

  it('maps participants, recurrence and the creator, resolving the creator name only for a staff read', async () => {
    const { booking } = await seedBooking();
    const withExtras = new BookingBuilder()
      .withId(booking.id)
      .withTenantId(TENANT_A)
      .withCustomerId(CUSTOMER_ID)
      .withLines(booking.lines)
      .withParticipantCount(2)
      .withAttendees([
        BookingAttendee.create(booking.id, TENANT_A, { name: 'Maria', isMinor: false }),
        BookingAttendee.create(booking.id, TENANT_A, { name: 'Pedro', isMinor: true }),
      ])
      .withRecurringScheduleId('schedule-1')
      .withCreatedByStaffId(STAFF_ID)
      .build();
    await repo.save(withExtras);
    staffPort.setName(TENANT_A, STAFF_ID, 'Ana Pereira');
    const names = jest.spyOn(staffPort, 'findNamesByIds');

    const customerRead = await ask(withExtras.id);
    expect(names).not.toHaveBeenCalled();
    expect(customerRead.createdByName).toBeNull();

    const staffRead = await ask(withExtras.id, { includeActorNames: true });
    expect(staffRead).toMatchObject({
      participantCount: 2,
      attendees: [
        { name: 'Maria', isMinor: false },
        { name: 'Pedro', isMinor: true },
      ],
      recurringScheduleId: 'schedule-1',
      createdByStaffId: STAFF_ID,
      createdByName: 'Ana Pereira',
    });
    expect(names).toHaveBeenCalledTimes(1);
  });

  describe('intake', () => {
    async function publishVersions(serviceId: string) {
      const v1 = ServiceBookingIntakeSchema.publish({
        tenantId: TENANT_A,
        serviceId,
        previousVersion: 0,
        questions: [
          { fieldKey: 'level', label: 'Nível de experiência', type: 'FREE_TEXT', required: true },
          { fieldKey: 'injury', label: 'Tem restrição?', type: 'BOOLEAN', required: false },
        ],
        consentText: 'Termo v1',
        requiresNamedAttendees: false,
        participantCountRequired: false,
      });
      await intakeRepo.publish(v1);
      const v2 = ServiceBookingIntakeSchema.publish({
        tenantId: TENANT_A,
        serviceId,
        previousVersion: 1,
        questions: [
          { fieldKey: 'level', label: 'Qual o seu nível?', type: 'FREE_TEXT', required: true },
        ],
        consentText: 'Termo v2',
        requiresNamedAttendees: false,
        participantCountRequired: false,
      });
      await intakeRepo.publish(v2);
    }

    it('labels the answers with the version the booking was made on, and falls back to the key', async () => {
      const { booking, service } = await seedBooking();
      await publishVersions(service.id);
      const withIntake = new BookingBuilder()
        .withId(booking.id)
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_ID)
        .withLines(booking.lines)
        .withIntake({
          intakeSchemaVersion: 1,
          intakeAnswers: { injury: true, level: 'Iniciante', removedKey: 'x' },
          consentAcceptedAt: new Date('2026-06-10T14:02:00.000Z'),
          consentVersion: 1,
        })
        .build();
      await repo.save(withIntake);

      const result = await ask(withIntake.id);

      expect(result.intake).toEqual({
        schemaVersion: 1,
        answers: [
          {
            fieldKey: 'level',
            label: 'Nível de experiência',
            type: 'FREE_TEXT',
            value: 'Iniciante',
          },
          { fieldKey: 'injury', label: 'Tem restrição?', type: 'BOOLEAN', value: true },
          { fieldKey: 'removedKey', label: 'removedKey', type: 'FREE_TEXT', value: 'x' },
        ],
        consentAcceptedAt: '2026-06-10T14:02:00.000Z',
        consentVersion: 1,
      });
    });

    it('reads the intake schema only when the booking has an intake, and returns a null consent for a staff-created one', async () => {
      const { booking } = await seedBooking();
      const read = jest.spyOn(intakeRepo, 'findAllByServiceId');

      expect((await ask(booking.id)).intake).toBeNull();
      expect(read).not.toHaveBeenCalled();

      const staffCreated = new BookingBuilder()
        .withId(booking.id)
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_ID)
        .withLines(booking.lines)
        .withIntake({
          intakeSchemaVersion: 1,
          intakeAnswers: {},
          consentAcceptedAt: null,
          consentVersion: null,
        })
        .build();
      await repo.save(staffCreated);

      expect((await ask(staffCreated.id)).intake).toMatchObject({
        consentAcceptedAt: null,
        consentVersion: null,
      });
      expect(read).toHaveBeenCalledTimes(1);
    });
  });

  describe('cancellation and rejection', () => {
    it('marks a customer cancel as byCustomer, with the contact name and no reason', async () => {
      const { booking } = await seedBooking();
      booking.cancel({ type: 'CUSTOMER', id: CUSTOMER_ID }, 'corr-1');
      await repo.save(booking);

      const result = await ask(booking.id, { includeActorNames: true });

      expect(result.cancellation).toMatchObject({
        byCustomer: true,
        reason: null,
        actorId: CUSTOMER_ID,
        actorName: booking.contactName,
      });
      expect(result.rejection).toBeNull();
    });

    it('resolves a staff cancel actor and keeps the reason; resolves them in one call with the creator', async () => {
      const { booking } = await seedBooking();
      booking.cancel({ type: 'STAFF', id: STAFF_ID }, 'corr-1', 'Equipamento em manutenção');
      await repo.save(booking);
      staffPort.setName(TENANT_A, STAFF_ID, 'Ana Pereira');
      const names = jest.spyOn(staffPort, 'findNamesByIds');

      const result = await ask(booking.id, { includeActorNames: true });

      expect(result.cancellation).toMatchObject({
        byCustomer: false,
        reason: 'Equipamento em manutenção',
        actorName: 'Ana Pereira',
      });
      expect(names).toHaveBeenCalledTimes(1);
    });

    it('reads a rejection from the aggregate', async () => {
      const { booking } = await seedBooking();
      const pending = new BookingBuilder()
        .withId(booking.id)
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_ID)
        .withStatus(BookingStatus.PENDING)
        .withLines(booking.lines)
        .build();
      pending.reject(
        { type: 'STAFF', id: STAFF_ID },
        'Não atendemos esse tipo de veículo.',
        'corr-1',
      );
      await repo.save(pending);
      staffPort.setName(TENANT_A, STAFF_ID, 'Ana Pereira');

      const result = await ask(pending.id, { includeActorNames: true });

      expect(result.rejection).toMatchObject({
        reason: 'Não atendemos esse tipo de veículo.',
        actorName: 'Ana Pereira',
      });
      expect(result.cancellation).toBeNull();
    });
  });

  it('never resolves a name from another tenant', async () => {
    const { booking } = await seedBooking();
    booking.cancel({ type: 'STAFF', id: STAFF_ID }, 'corr-1');
    await repo.save(booking);
    staffPort.setName(TENANT_B, STAFF_ID, 'Another Tenant Staff');

    const result = await ask(booking.id, { includeActorNames: true });

    expect(result.cancellation?.actorName).toBeNull();
  });
});
