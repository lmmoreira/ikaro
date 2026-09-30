import { InMemoryBookingCustomerPort } from '../../../../test/infrastructure/in-memory-booking-customer.port';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { InMemoryResourceOccupancyRepository } from '../../../../test/repositories/booking/in-memory-resource-occupancy.repository';
import { ResourceBuilder, ServiceBuilder } from '../../../../test/builders/booking/index';
import { testAddress } from '../../../../test/utils/address-helpers';
import { Money } from '../../../../shared/value-objects/money';
import { BookingStatus } from '../../domain/booking.aggregate';
import {
  BookingCustomerNotFoundError,
  CustomerPhoneNotSetError,
} from '../../domain/errors/booking-domain.error';
import { RecurrenceOccurrence } from '../../domain/recurrence-rule.helpers';
import { RecurringBookingSchedule } from '../../domain/recurring-booking-schedule.aggregate';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import { AvailabilityService } from '../../domain/services/availability.service';
import { materializeRecurringScheduleOccurrences } from './materialize-recurring-schedule-occurrences.helpers';

const TENANT = '10000000-0000-4000-8000-000000000700';
const CUSTOMER_ID = '20000000-0000-4000-8000-000000000702';
const STAFF_ID = '30000000-0000-4000-8000-000000000703';

const OCCURRENCES: RecurrenceOccurrence[] = [1, 8, 15].map((day) => ({
  occurrenceStart: new Date(Date.UTC(2026, 9, day, 13)),
  occurrenceStartLocalDate: `2026-10-${String(day).padStart(2, '0')}`,
}));

describe('materializeRecurringScheduleOccurrences', () => {
  let bookingRepo: InMemoryBookingRepository;
  let occupancyRepo: InMemoryResourceOccupancyRepository;
  let customerPort: InMemoryBookingCustomerPort;

  const room = (name: string, turnoverMinutes = 0) =>
    new ResourceBuilder()
      .withTenantId(TENANT)
      .withType(ResourceType.ROOM)
      .withName(name)
      .withTurnoverMinutes(turnoverMinutes)
      .build();

  const service = (bufferAfterMinutes: number | null = null) =>
    new ServiceBuilder()
      .withTenantId(TENANT)
      .withName('Sala Aurora')
      .withPrice(Money.from(200, 'BRL'))
      .withBufferAfterMinutes(bufferAfterMinutes)
      .withResourceRequirements([
        ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'CUSTOMER_CHOICE' }),
      ])
      .build();

  function schedule(): RecurringBookingSchedule {
    return RecurringBookingSchedule.request({
      tenantId: TENANT,
      customerId: CUSTOMER_ID,
      serviceId: 'service-1',
      recurrence: {
        frequency: 'WEEKLY',
        daysOfWeek: ['thursday'],
        startTime: '10:00',
        durationMinutes: 90,
      },
      startsOn: '2026-10-01',
      endsOn: '2026-10-15',
      maxTermDays: 90,
      assignmentPolicy: 'FIXED_ASSIGNMENT',
      resourceAssignments: [],
      status: 'ACTIVE',
      approvalHoldExpiresAt: null,
      createdByStaffId: null,
      correlationId: 'corr',
    });
  }

  function run(
    overrides: {
      resources?: ReturnType<typeof room>[];
      serviceOverride?: ReturnType<typeof service>;
      occurrences?: RecurrenceOccurrence[];
      approvedByStaffId?: string | null;
    } = {},
  ) {
    const usedService = overrides.serviceOverride ?? service();
    return materializeRecurringScheduleOccurrences(
      {
        bookingRepo,
        customerPort,
        occupancyRepo,
        availabilityService: new AvailabilityService(),
      },
      {
        schedule: schedule(),
        service: usedService,
        occurrences: overrides.occurrences ?? OCCURRENCES,
        resources: overrides.resources ?? OCCURRENCES.map(() => room('Sala A')),
        approvedByStaffId: overrides.approvedByStaffId ?? null,
      },
    );
  }

  beforeEach(() => {
    bookingRepo = new InMemoryBookingRepository();
    occupancyRepo = new InMemoryResourceOccupancyRepository();
    customerPort = new InMemoryBookingCustomerPort();
    customerPort.setProfile(CUSTOMER_ID, {
      email: 'ana@example.com',
      name: 'Ana Souza',
      phone: '+5531999999999',
      defaultAddress: testAddress(),
    });
  });

  it('creates one APPROVED booking per occurrence, linked to the schedule, and returns their ids', async () => {
    const ids = await run();

    const bookings = await bookingRepo.findAllByTenant(TENANT);
    expect(ids).toHaveLength(3);
    expect(bookings.map((b) => b.id).sort()).toEqual([...ids].sort());
    expect(bookings.every((b) => b.status === BookingStatus.APPROVED)).toBe(true);
    expect(new Set(bookings.map((b) => b.recurringScheduleId)).size).toBe(1);
    expect(bookings.map((b) => b.scheduledAt.getTime()).sort()).toEqual(
      OCCURRENCES.map((o) => o.occurrenceStart.getTime()),
    );
  });

  it("snapshots the customer's contact and the recurrence's duration and the service price", async () => {
    await run();

    const [booking] = await bookingRepo.findAllByTenant(TENANT);
    expect(booking.customerId).toBe(CUSTOMER_ID);
    expect(booking.contactName).toBe('Ana Souza');
    expect(booking.contactEmail.address).toBe('ana@example.com');
    expect(booking.contactPhone.value).toBe('+5531999999999');
    expect(booking.contactAddress).not.toBeNull();
    expect(booking.pickupAddress).toBeNull();
    // The schedule's own duration, not the service's default one.
    expect(booking.lines[0].durationMinsAtBooking).toBe(90);
    expect(booking.lines[0].priceAtBooking.amount.toFixed(2)).toBe('200.00');
  });

  it('records the approving staff member, or none when the schedule auto-confirmed', async () => {
    await run({ approvedByStaffId: STAFF_ID });
    const approved = await bookingRepo.findAllByTenant(TENANT);
    expect(approved.every((b) => b.approvedBy === STAFF_ID)).toBe(true);

    bookingRepo = new InMemoryBookingRepository();
    await run({ approvedByStaffId: null });
    const auto = await bookingRepo.findAllByTenant(TENANT);
    expect(auto.every((b) => b.approvedBy === null)).toBe(true);
  });

  it('inserts every booking in one call and every occupancy row in one call', async () => {
    const insertSpy = jest.spyOn(bookingRepo, 'insertMany');
    const assignSpy = jest.spyOn(occupancyRepo, 'assignMany');
    const singleSave = jest.spyOn(bookingRepo, 'save');
    const singleAssign = jest.spyOn(occupancyRepo, 'assign');

    await run();

    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(insertSpy.mock.calls[0][0]).toHaveLength(3);
    expect(assignSpy).toHaveBeenCalledTimes(1);
    expect(assignSpy.mock.calls[0][1]).toHaveLength(3);
    expect(singleSave).not.toHaveBeenCalled();
    expect(singleAssign).not.toHaveBeenCalled();
  });

  it('commits the occupancy of each occurrence on the planned resource for the occurrence window', async () => {
    const resources = [room('Sala A'), room('Sala B'), room('Sala A')];
    const assignSpy = jest.spyOn(occupancyRepo, 'assignMany');

    await run({ resources });

    const [tenantId, assignments, lockState, holdExpiresAt] = assignSpy.mock.calls[0];
    expect(tenantId).toBe(TENANT);
    expect(lockState).toBe('COMMITTED');
    expect(holdExpiresAt).toBeNull();
    expect(assignments.map((a) => a.candidates[0].resourceId)).toEqual(resources.map((r) => r.id));
    expect(assignments.map((a) => a.candidates[0].startsAt)).toEqual(
      OCCURRENCES.map((o) => o.occurrenceStart),
    );
    // Each assignment is keyed by its own booking's single line.
    const bookings = await bookingRepo.findAllByTenant(TENANT);
    const lineIds = new Set(bookings.map((b) => b.lines[0].lineId));
    expect(assignments.every((a) => lineIds.has(a.bookingLineId))).toBe(true);
    expect(assignments[0].candidates[0]).toMatchObject({
      legIndex: null,
      quantityPosition: null,
      isBundleMember: false,
      selectionMode: 'CUSTOMER_CHOICE',
      resourceType: ResourceType.ROOM,
    });
  });

  it("extends each occupancy window by the larger of the service buffer and the resource's turnover", async () => {
    const assignSpy = jest.spyOn(occupancyRepo, 'assignMany');
    const turnover = room('Sala A', 30);
    const noTurnover = room('Sala B', 0);

    await run({
      serviceOverride: service(15),
      resources: [turnover, noTurnover, turnover],
    });

    const windows = assignSpy.mock.calls[0][1].map(
      (a) => (a.candidates[0].endsAt.getTime() - a.candidates[0].startsAt.getTime()) / 60_000,
    );
    // 90 minutes of service plus max(15 buffer, 30 turnover) / max(15, 0).
    expect(windows).toEqual([120, 105, 120]);
  });

  it('writes the occupancy rows to the repository the conflict check reads', async () => {
    const sala = room('Sala A');
    const resources = OCCURRENCES.map(() => sala);

    await run({ resources });

    const windows = await occupancyRepo.findActiveWindows(
      TENANT,
      [sala.id],
      new Date(Date.UTC(2026, 9, 1)),
      new Date(Date.UTC(2026, 9, 30)),
    );
    expect(windows).toHaveLength(3);
  });

  it('fails with BookingCustomerNotFoundError when the customer is gone, writing nothing', async () => {
    customerPort = new InMemoryBookingCustomerPort();
    const insertSpy = jest.spyOn(bookingRepo, 'insertMany');

    await expect(run()).rejects.toThrow(BookingCustomerNotFoundError);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('fails with CustomerPhoneNotSetError when the customer has no phone, writing nothing', async () => {
    customerPort.setProfile(CUSTOMER_ID, {
      email: 'ana@example.com',
      name: 'Ana Souza',
      phone: null,
      defaultAddress: null,
    });
    const insertSpy = jest.spyOn(bookingRepo, 'insertMany');
    const assignSpy = jest.spyOn(occupancyRepo, 'assignMany');

    await expect(run()).rejects.toThrow(CustomerPhoneNotSetError);
    expect(insertSpy).not.toHaveBeenCalled();
    expect(assignSpy).not.toHaveBeenCalled();
  });

  it('creates nothing for a term without occurrences', async () => {
    const ids = await run({ occurrences: [], resources: [] });

    expect(ids).toEqual([]);
    expect(await bookingRepo.findAllByTenant(TENANT)).toHaveLength(0);
  });
});
