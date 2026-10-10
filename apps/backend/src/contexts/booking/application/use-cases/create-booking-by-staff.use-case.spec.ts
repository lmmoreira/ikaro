import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryResourceOccupancyRepository } from '../../../../test/repositories/booking/in-memory-resource-occupancy.repository';
import { InMemoryServiceIntakeSchemaRepository } from '../../../../test/repositories/booking/in-memory-service-intake-schema.repository';
import { InMemoryTenantLock } from '../../../../test/infrastructure/in-memory-tenant-lock';
import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { InMemoryBookingCustomerPort } from '../../../../test/infrastructure/in-memory-booking-customer.port';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { ResourceBuilder, ServiceBuilder } from '../../../../test/builders/booking/index';
import { testAddress, testAddressProps } from '../../../../test/utils/address-helpers';
import { futureDate, pastDate } from '../../../../test/utils/date-helpers';
import { AvailabilityService } from '../../domain/services/availability.service';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import { BookingStatus } from '../../domain/booking.aggregate';
import {
  BookingCustomerNotFoundError,
  BookingScheduledInPastError,
  BookingServiceSessionNotBookableError,
  BookingDurationOutOfRangeError,
  BookingIntakeAnswerMissingError,
  BookingSlotUnavailableError,
  BookingTooFarAheadError,
  BookingTooSoonError,
  CustomerPhoneNotSetError,
  PickupAddressRequiredError,
} from '../../domain/errors/booking-domain.error';
import { ServiceBookingIntakeSchema } from '../../domain/service-booking-intake-schema';
import { BookingSlotConflictService } from '../services/booking-slot-conflict.service';
import { BookingQuoteService } from '../services/booking-quote.service';
import { BookingIntakeValidationService } from '../services/booking-intake-validation.service';
import { PhotoExistenceService } from '../services/photo-existence.service';
import { CreateBookingByStaffUseCase } from './create-booking-by-staff.use-case';
import { RequestAuthenticatedBookingUseCase } from './request-authenticated-booking.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000390';
const CUSTOMER_ID = '20000000-0000-4000-8000-000000000390';
const STAFF_ID = '20000000-0000-4000-8000-000000000391';
const CORRELATION_ID = 'corr-staff-booking-test';

const scheduledAt = `${futureDate(1)}T10:00:00.000Z`;
const window = { minBookingAdvanceHours: 0, maxBookingAdvanceDays: 90 };

describe('CreateBookingByStaffUseCase', () => {
  let serviceRepo: InMemoryServiceRepository;
  let resourceRepo: InMemoryResourceRepository;
  let occupancyRepo: InMemoryResourceOccupancyRepository;
  let intakeSchemaRepo: InMemoryServiceIntakeSchemaRepository;
  let bookingRepo: InMemoryBookingRepository;
  let eventBus: InMemoryEventBus;
  let customerPort: InMemoryBookingCustomerPort;
  let storageService: InMemoryStorageService;
  let useCase: CreateBookingByStaffUseCase;
  let customerUseCase: RequestAuthenticatedBookingUseCase;
  let serviceId: string;

  beforeEach(async () => {
    serviceRepo = new InMemoryServiceRepository();
    resourceRepo = new InMemoryResourceRepository();
    occupancyRepo = new InMemoryResourceOccupancyRepository();
    intakeSchemaRepo = new InMemoryServiceIntakeSchemaRepository();
    eventBus = new InMemoryEventBus();
    bookingRepo = new InMemoryBookingRepository(eventBus);
    customerPort = new InMemoryBookingCustomerPort();
    storageService = new InMemoryStorageService();
    const txManager = new InMemoryTransactionManager();
    const sharedDeps = [
      serviceRepo,
      resourceRepo,
      occupancyRepo,
      intakeSchemaRepo,
      new AvailabilityService(),
      new BookingSlotConflictService(occupancyRepo, new InMemoryTenantLock()),
      new PhotoExistenceService(storageService),
      new BookingQuoteService(),
      new BookingIntakeValidationService(intakeSchemaRepo),
      bookingRepo,
      txManager,
    ] as const;
    useCase = new CreateBookingByStaffUseCase(customerPort, ...sharedDeps);
    customerUseCase = new RequestAuthenticatedBookingUseCase(customerPort, ...sharedDeps);

    const service = new ServiceBuilder().withTenantId(TENANT_A).withName('Lavagem Simples').build();
    await serviceRepo.save(service);
    serviceId = service.id;
    await resourceRepo.save(
      new ResourceBuilder().withTenantId(TENANT_A).withType(ResourceType.LOCATION).build(),
    );
    customerPort.setProfile(CUSTOMER_ID, {
      email: 'cliente@example.com',
      name: 'Maria Silva',
      phone: '+5531999999999',
      defaultAddress: null,
    });
  });

  const customerInput = () => ({
    customerId: CUSTOMER_ID,
    scheduledAt,
    serviceIds: [serviceId],
    tenantId: TENANT_A,
    correlationId: CORRELATION_ID,
    staffId: STAFF_ID,
    countryCode: 'BR',
    timezone: 'America/Sao_Paulo',
    tenantBookingWindow: window,
  });

  const guestInput = () => ({
    contactName: 'Pessoa Nova',
    contactPhone: '+5531977777777',
    contactEmail: 'nova@example.com',
    scheduledAt,
    serviceIds: [serviceId],
    tenantId: TENANT_A,
    correlationId: CORRELATION_ID,
    staffId: STAFF_ID,
    countryCode: 'BR',
    timezone: 'America/Sao_Paulo',
    tenantBookingWindow: window,
  });

  describe('for a customer of the tenant', () => {
    it('creates an APPROVED CUSTOMER booking from the customer profile, approved by the staff member', async () => {
      const result = await useCase.execute(customerInput());

      expect(result.status).toBe(BookingStatus.APPROVED);
      const saved = await bookingRepo.findById(result.bookingId, TENANT_A);
      expect(saved!.type).toBe('CUSTOMER');
      expect(saved!.customerId).toBe(CUSTOMER_ID);
      expect(saved!.contactEmail.address).toBe('cliente@example.com');
      expect(saved!.contactName).toBe('Maria Silva');
      expect(saved!.contactPhone.value).toBe('+5531999999999');
      expect(saved!.approvedBy).toBe(STAFF_ID);
      expect(saved!.createdByStaffId).toBe(STAFF_ID);
      expect(saved!.approvedAt).toBeInstanceOf(Date);
    });

    it('publishes BookingApproved and no BookingRequested', async () => {
      await useCase.execute(customerInput());

      expect(eventBus.published.map((e) => e.eventName)).toEqual(['BookingApproved']);
    });

    it('takes a COMMITTED occupancy with no hold expiry', async () => {
      const result = await useCase.execute(customerInput());

      const lineIds = result.lines.map((l) => l.lineId);
      const rows = await occupancyRepo.findOccupancyByBookingLines(TENANT_A, lineIds);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.lockState === 'COMMITTED' && r.holdExpiresAt === null)).toBe(true);
    });

    it('rejects an unknown customer with BookingCustomerNotFoundError', async () => {
      await expect(
        useCase.execute({ ...customerInput(), customerId: '20000000-0000-4000-8000-000000009999' }),
      ).rejects.toBeInstanceOf(BookingCustomerNotFoundError);
    });

    it('rejects a customer without a phone with CustomerPhoneNotSetError', async () => {
      customerPort.setProfile(CUSTOMER_ID, {
        email: 'sem@example.com',
        name: 'Sem Telefone',
        phone: null,
        defaultAddress: null,
      });

      await expect(useCase.execute(customerInput())).rejects.toBeInstanceOf(
        CustomerPhoneNotSetError,
      );
    });

    it("falls back to the customer's default address for a pickup-required service", async () => {
      const pickupService = new ServiceBuilder()
        .withTenantId(TENANT_A)
        .withRequiresPickupAddress(true)
        .build();
      await serviceRepo.save(pickupService);
      customerPort.setProfile(CUSTOMER_ID, {
        email: 'cliente@example.com',
        name: 'Maria Silva',
        phone: '+5531999999999',
        defaultAddress: testAddress(),
      });

      const result = await useCase.execute({
        ...customerInput(),
        serviceIds: [pickupService.id],
      });

      const saved = await bookingRepo.findById(result.bookingId, TENANT_A);
      expect(saved!.pickupAddress).not.toBeNull();
    });

    it('uses the pickup address staff sent over the default one', async () => {
      const pickupService = new ServiceBuilder()
        .withTenantId(TENANT_A)
        .withRequiresPickupAddress(true)
        .build();
      await serviceRepo.save(pickupService);
      customerPort.setProfile(CUSTOMER_ID, {
        email: 'cliente@example.com',
        name: 'Maria Silva',
        phone: '+5531999999999',
        defaultAddress: testAddress(),
      });

      const result = await useCase.execute({
        ...customerInput(),
        serviceIds: [pickupService.id],
        pickupAddress: { ...testAddressProps(), street: 'Rua Digitada' },
      });

      const saved = await bookingRepo.findById(result.bookingId, TENANT_A);
      expect(saved!.pickupAddress!.street).toBe('Rua Digitada');
    });
  });

  describe('for a person who is not in the system', () => {
    it('creates an APPROVED GUEST booking from the contact trio', async () => {
      const result = await useCase.execute(guestInput());

      expect(result.status).toBe(BookingStatus.APPROVED);
      const saved = await bookingRepo.findById(result.bookingId, TENANT_A);
      expect(saved!.type).toBe('GUEST');
      expect(saved!.customerId).toBeNull();
      expect(saved!.contactEmail.address).toBe('nova@example.com');
      expect(saved!.contactName).toBe('Pessoa Nova');
      expect(saved!.contactPhone.value).toBe('+5531977777777');
      expect(saved!.approvedBy).toBe(STAFF_ID);
      expect(saved!.createdByStaffId).toBe(STAFF_ID);
    });

    it('publishes BookingApproved carrying the guest contact and a null customerId', async () => {
      await useCase.execute(guestInput());

      expect(eventBus.published).toHaveLength(1);
      expect(eventBus.published[0].eventName).toBe('BookingApproved');
      expect(eventBus.published[0].data).toMatchObject({
        customerId: null,
        contactEmail: 'nova@example.com',
        approvedBy: STAFF_ID,
      });
    });

    it('requires the pickup address typed by staff for a pickup-required service', async () => {
      const pickupService = new ServiceBuilder()
        .withTenantId(TENANT_A)
        .withRequiresPickupAddress(true)
        .build();
      await serviceRepo.save(pickupService);

      await expect(
        useCase.execute({ ...guestInput(), serviceIds: [pickupService.id] }),
      ).rejects.toBeInstanceOf(PickupAddressRequiredError);
    });

    it('stores the pickup address staff typed', async () => {
      const pickupService = new ServiceBuilder()
        .withTenantId(TENANT_A)
        .withRequiresPickupAddress(true)
        .build();
      await serviceRepo.save(pickupService);

      const result = await useCase.execute({
        ...guestInput(),
        serviceIds: [pickupService.id],
        pickupAddress: testAddressProps(),
      });

      const saved = await bookingRepo.findById(result.bookingId, TENANT_A);
      expect(saved!.pickupAddress).not.toBeNull();
    });
  });

  describe('booking window', () => {
    // Negative guarantee: the minimum notice is skipped on the staff path only.
    it('accepts a start inside the minimum notice that a customer is refused', async () => {
      const strict = { minBookingAdvanceHours: 24 * 10, maxBookingAdvanceDays: 90 };

      await expect(
        customerUseCase.execute({
          scheduledAt,
          serviceIds: [serviceId],
          tenantId: TENANT_A,
          correlationId: CORRELATION_ID,
          customerId: CUSTOMER_ID,
          countryCode: 'BR',
          timezone: 'America/Sao_Paulo',
          tenantBookingWindow: strict,
        }),
      ).rejects.toBeInstanceOf(BookingTooSoonError);

      const result = await useCase.execute({ ...customerInput(), tenantBookingWindow: strict });
      expect(result.status).toBe(BookingStatus.APPROVED);
    });

    it('still rejects a start in the past', async () => {
      await expect(
        useCase.execute({
          ...customerInput(),
          scheduledAt: `${pastDate(1)}T10:00:00.000Z`,
        }),
      ).rejects.toBeInstanceOf(BookingScheduledInPastError);
    });

    it('still rejects a start beyond the maximum advance', async () => {
      await expect(
        useCase.execute({
          ...customerInput(),
          tenantBookingWindow: { minBookingAdvanceHours: 0, maxBookingAdvanceDays: 1 },
          scheduledAt: `${futureDate(30)}T10:00:00.000Z`,
        }),
      ).rejects.toBeInstanceOf(BookingTooFarAheadError);
    });
  });

  describe('services and conflicts', () => {
    it('rejects a non-APPOINTMENT service', async () => {
      const session = new ServiceBuilder()
        .withTenantId(TENANT_A)
        .withBookingModel('SESSION')
        .build();
      await serviceRepo.save(session);

      await expect(
        useCase.execute({ ...customerInput(), serviceIds: [session.id] }),
      ).rejects.toBeInstanceOf(BookingServiceSessionNotBookableError);
    });

    it('refuses a slot another booking already occupies with BookingSlotUnavailableError', async () => {
      await useCase.execute(customerInput());

      await expect(useCase.execute(guestInput())).rejects.toBeInstanceOf(
        BookingSlotUnavailableError,
      );
    });
  });

  describe('intake (staff may skip it, a customer may not)', () => {
    let intakeServiceId: string;

    beforeEach(async () => {
      const intakeService = new ServiceBuilder().withTenantId(TENANT_A).build();
      await serviceRepo.save(intakeService);
      intakeServiceId = intakeService.id;
      await intakeSchemaRepo.publish(
        ServiceBookingIntakeSchema.publish({
          tenantId: TENANT_A,
          serviceId: intakeServiceId,
          previousVersion: 0,
          questions: [
            { fieldKey: 'vehiclePlate', label: 'Placa', type: 'FREE_TEXT', required: true },
          ],
          consentText: 'Aceito os termos',
          requiresNamedAttendees: false,
          participantCountRequired: true,
        }),
      );
    });

    // Negative guarantee: the same service still demands the intake from a customer.
    it('refuses a customer booking that skips the required intake', async () => {
      await expect(
        customerUseCase.execute({
          scheduledAt,
          serviceIds: [intakeServiceId],
          tenantId: TENANT_A,
          correlationId: CORRELATION_ID,
          customerId: CUSTOMER_ID,
          countryCode: 'BR',
          timezone: 'America/Sao_Paulo',
          tenantBookingWindow: window,
        }),
      ).rejects.toBeInstanceOf(BookingIntakeAnswerMissingError);
    });

    it('creates the booking when staff skip every intake field, with no intake recorded', async () => {
      const result = await useCase.execute({ ...customerInput(), serviceIds: [intakeServiceId] });

      expect(result.status).toBe(BookingStatus.APPROVED);
      const saved = await bookingRepo.findById(result.bookingId, TENANT_A);
      expect(saved!.intake).toBeNull();
      expect(saved!.attendees).toEqual([]);
    });

    it('does the same for a guest booking', async () => {
      const result = await useCase.execute({ ...guestInput(), serviceIds: [intakeServiceId] });

      const saved = await bookingRepo.findById(result.bookingId, TENANT_A);
      expect(saved!.type).toBe('GUEST');
      expect(saved!.intake).toBeNull();
    });

    it('stores the answers staff did enter, with no consent recorded', async () => {
      const result = await useCase.execute({
        ...customerInput(),
        serviceIds: [intakeServiceId],
        intakeAnswers: { vehiclePlate: 'ABC1D23' },
      });

      const saved = await bookingRepo.findById(result.bookingId, TENANT_A);
      expect(saved!.intake).toMatchObject({
        intakeAnswers: { vehiclePlate: 'ABC1D23' },
        consentAcceptedAt: null,
        consentVersion: null,
      });
    });

    it('records the consent when staff tick it', async () => {
      const result = await useCase.execute({
        ...customerInput(),
        serviceIds: [intakeServiceId],
        consentAccepted: true,
      });

      const saved = await bookingRepo.findById(result.bookingId, TENANT_A);
      expect(saved!.intake!.consentAcceptedAt).toBeInstanceOf(Date);
      expect(saved!.intake!.consentVersion).toBe(1);
    });
  });

  // The staff entry point must hand the booking-flow fields to the same shared steps a customer's
  // request uses; these pin that wiring (the steps themselves are covered through the other two
  // use cases).
  describe('booking-flow fields reach the shared steps', () => {
    it('applies a customer-selected duration and quotes the price', async () => {
      const variable = new ServiceBuilder()
        .withTenantId(TENANT_A)
        .withBookingPolicy({
          durationPolicy: 'CUSTOMER_SELECTED',
          durationMinMinutes: 60,
          durationMaxMinutes: 240,
          durationIncrementMinutes: 30,
          pricingPolicy: 'PER_TIME_INCREMENT',
          pricingIncrementMinutes: 60,
          pricePerIncrementAmount: 50,
          minimumChargeAmount: null,
        })
        .build();
      await serviceRepo.save(variable);

      const result = await useCase.execute({
        ...customerInput(),
        serviceIds: [variable.id],
        durationMinutes: 90,
      });

      expect(result.lines[0].durationMinsAtBooking).toBe(90);
      expect(result.lines[0].priceAtBooking.amount).toBe(100);
    });

    // Not an intake field: staff are not exempt from choosing a duration.
    it('still requires a duration for a customer-selected-duration service', async () => {
      const variable = new ServiceBuilder()
        .withTenantId(TENANT_A)
        .withBookingPolicy({
          durationPolicy: 'CUSTOMER_SELECTED',
          durationMinMinutes: 60,
          durationMaxMinutes: 240,
          durationIncrementMinutes: 30,
          pricingPolicy: 'PER_TIME_INCREMENT',
          pricingIncrementMinutes: 60,
          pricePerIncrementAmount: 50,
          minimumChargeAmount: null,
        })
        .build();
      await serviceRepo.save(variable);

      await expect(
        useCase.execute({ ...customerInput(), serviceIds: [variable.id] }),
      ).rejects.toBeInstanceOf(BookingDurationOutOfRangeError);
    });

    it('books the resource staff picked for a customer-choice requirement', async () => {
      const rooms = [
        new ResourceBuilder().withTenantId(TENANT_A).withType(ResourceType.ROOM).build(),
        new ResourceBuilder().withTenantId(TENANT_A).withType(ResourceType.ROOM).build(),
      ];
      for (const room of rooms) await resourceRepo.save(room);
      const roomService = new ServiceBuilder()
        .withTenantId(TENANT_A)
        .withResourceRequirements([
          ResourceRequirement.create({
            type: ResourceType.ROOM,
            selectionMode: 'CUSTOMER_CHOICE',
          }),
        ])
        .build();
      await serviceRepo.save(roomService);

      const result = await useCase.execute({
        ...customerInput(),
        serviceIds: [roomService.id],
        resourceSelections: [
          {
            serviceId: roomService.id,
            legIndex: null,
            resourceType: ResourceType.ROOM,
            resourceId: rooms[1].id,
          },
        ],
      });

      const occupancy = await occupancyRepo.findOccupancyByBookingLines(
        TENANT_A,
        result.lines.map((l) => l.lineId),
      );
      expect(occupancy.map((o) => o.resourceId)).toEqual([rooms[1].id]);
    });

    it('stores the named attendees and participant count staff entered', async () => {
      const groupService = new ServiceBuilder().withTenantId(TENANT_A).build();
      await serviceRepo.save(groupService);
      await intakeSchemaRepo.publish(
        ServiceBookingIntakeSchema.publish({
          tenantId: TENANT_A,
          serviceId: groupService.id,
          previousVersion: 0,
          questions: [],
          consentText: 'Aceito os termos',
          requiresNamedAttendees: true,
          participantCountRequired: true,
        }),
      );

      const result = await useCase.execute({
        ...customerInput(),
        serviceIds: [groupService.id],
        participantCount: 2,
        attendees: [{ name: 'Ana' }, { name: 'Bia', isMinor: true }],
      });

      const saved = await bookingRepo.findById(result.bookingId, TENANT_A);
      expect(saved!.participantCount).toBe(2);
      expect(saved!.attendees.map((a) => [a.name, a.isMinor])).toEqual([
        ['Ana', false],
        ['Bia', true],
      ]);
    });

    it('stores no intake when staff send only blank text answers', async () => {
      const blankService = new ServiceBuilder().withTenantId(TENANT_A).build();
      await serviceRepo.save(blankService);
      await intakeSchemaRepo.publish(
        ServiceBookingIntakeSchema.publish({
          tenantId: TENANT_A,
          serviceId: blankService.id,
          previousVersion: 0,
          questions: [
            { fieldKey: 'vehiclePlate', label: 'Placa', type: 'FREE_TEXT', required: true },
          ],
          consentText: 'Aceito os termos',
          requiresNamedAttendees: false,
          participantCountRequired: false,
        }),
      );

      const result = await useCase.execute({
        ...customerInput(),
        serviceIds: [blankService.id],
        intakeAnswers: { vehiclePlate: '   ' },
      });

      const saved = await bookingRepo.findById(result.bookingId, TENANT_A);
      expect(saved!.intake).toBeNull();
    });
  });
});
