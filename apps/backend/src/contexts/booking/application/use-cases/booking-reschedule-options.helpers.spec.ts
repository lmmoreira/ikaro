import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { BookingBuilder, BookingLineBuilder } from '../../../../test/builders/booking/index';
import { ServiceBuilder } from '../../../../test/builders/booking/service.builder';
import { BookingStatus } from '../../domain/booking.aggregate';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import { ServiceLeg } from '../../domain/service-leg';
import { Service } from '../../domain/service.aggregate';
import { BookingLineOccupancyRow } from '../ports/resource-occupancy-repository.port';
import { buildRescheduleOptions } from './booking-reschedule-options.helpers';

const TENANT = '10000000-0000-4000-8000-000000000701';
const TENANT_WINDOW = { minBookingAdvanceHours: 2, maxBookingAdvanceDays: 90 };
const SCHEDULED_AT = new Date('2030-06-20T13:00:00.000Z');

function occupancyRow(
  bookingLineId: string,
  overrides: Partial<BookingLineOccupancyRow> = {},
): BookingLineOccupancyRow {
  return {
    bookingLineId,
    resourceId: uuidv7(),
    resourceType: ResourceType.STAFF,
    resourceName: 'Renata Souza',
    legIndex: null,
    quantityPosition: null,
    startsAt: SCHEDULED_AT,
    endsAt: new Date(SCHEDULED_AT.getTime() + 3_600_000),
    lockState: 'COMMITTED',
    holdExpiresAt: null,
    gapMinutes: null,
    gapSource: null,
    ...overrides,
  };
}

function serviceWith(
  requirements: ResourceRequirement[],
  policy: Parameters<ServiceBuilder['withBookingPolicy']>[0] = {},
): Service {
  return new ServiceBuilder()
    .withTenantId(TENANT)
    .withResourceRequirements(requirements)
    .withBookingPolicy(policy)
    .build();
}

function bookingFor(services: Service[], durations: number[] = []) {
  const lines = services.map((service, index) =>
    new BookingLineBuilder()
      .withServiceId(service.id)
      .withServiceNameAtBooking(service.name)
      .withDurationMinsAtBooking(durations[index] ?? 60)
      .build(),
  );
  const booking = new BookingBuilder()
    .withTenantId(TENANT)
    .withStatus(BookingStatus.APPROVED)
    .withScheduledAt(SCHEDULED_AT)
    .withLines(lines)
    .build();
  return { booking, lines };
}

function build(
  services: Service[],
  rows: (lines: ReturnType<typeof bookingFor>['lines']) => BookingLineOccupancyRow[],
  durations: number[] = [],
) {
  const { booking, lines } = bookingFor(services, durations);
  return buildRescheduleOptions({
    booking,
    serviceMap: new Map(services.map((service) => [service.id, service])),
    occupancyRows: rows(lines),
    tenantDefaultRescheduleWindowHours: 48,
    tenantBookingWindow: TENANT_WINDOW,
  });
}

describe('buildRescheduleOptions', () => {
  const staffChoice = () =>
    ResourceRequirement.create({ type: ResourceType.STAFF, selectionMode: 'CUSTOMER_CHOICE' });

  it('keeps a flat CUSTOMER_CHOICE pick as a selection and a display entry', () => {
    const service = serviceWith([staffChoice()]);
    const result = build([service], ([line]) => [occupancyRow(line.lineId)]);

    expect(result.serviceIds).toEqual([service.id]);
    expect(result.resourceSelections).toHaveLength(1);
    expect(result.resourceSelections[0]).toMatchObject({
      serviceId: service.id,
      legIndex: null,
      resourceType: ResourceType.STAFF,
    });
    expect(result.keptPicks).toEqual([
      {
        serviceName: service.name,
        legName: null,
        legIndex: null,
        resourceType: ResourceType.STAFF,
        resourceName: 'Renata Souza',
      },
    ]);
  });

  it('does not pin an automatically assigned resource', () => {
    const service = serviceWith([
      ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_ANY' }),
    ]);
    const result = build([service], ([line]) => [
      occupancyRow(line.lineId, { resourceType: ResourceType.ROOM, resourceName: 'Sala 2' }),
    ]);

    expect(result.resourceSelections).toEqual([]);
    expect(result.keptPicks).toEqual([]);
  });

  it('keeps only the CUSTOMER_CHOICE requirement of a bundle', () => {
    const service = serviceWith([
      staffChoice(),
      ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_ANY' }),
    ]);
    const result = build([service], ([line]) => [
      occupancyRow(line.lineId),
      occupancyRow(line.lineId, { resourceType: ResourceType.ROOM, resourceName: 'Sala 2' }),
    ]);

    expect(result.keptPicks.map((pick) => pick.resourceType)).toEqual([ResourceType.STAFF]);
  });

  it('names the leg of a journey pick and skips the automatic leg', () => {
    const journey = new ServiceBuilder()
      .withTenantId(TENANT)
      .withLegs([
        ServiceLeg.create({
          legIndex: 0,
          name: 'Massagem',
          durationMinutes: 45,
          resourceRequirements: [staffChoice()],
        }),
        ServiceLeg.create({
          legIndex: 1,
          name: 'Relaxamento',
          durationMinutes: 30,
          resourceRequirements: [
            ResourceRequirement.create({
              type: ResourceType.EQUIPMENT,
              selectionMode: 'AUTO_ANY',
            }),
          ],
        }),
      ])
      .build();
    const result = build([journey], ([line]) => [
      occupancyRow(line.lineId, { legIndex: 0 }),
      occupancyRow(line.lineId, {
        legIndex: 1,
        resourceType: ResourceType.EQUIPMENT,
        resourceName: 'Poltrona 1',
      }),
    ]);

    expect(result.keptPicks).toHaveLength(1);
    expect(result.keptPicks[0]).toMatchObject({ legName: 'Massagem', legIndex: 0 });
    expect(result.resourceSelections[0].legIndex).toBe(0);
  });

  it('pins the kept duration only for a customer-selected duration line', () => {
    const fixed = serviceWith([]);
    const variable = serviceWith([], { durationPolicy: 'CUSTOMER_SELECTED' });

    expect(build([fixed], () => [], [60]).durationMinutes).toBeNull();
    expect(build([fixed, variable], () => [], [60, 90]).durationMinutes).toBe(90);
  });

  it('uses the tenant default reschedule window when no service overrides it', () => {
    const result = build([serviceWith([])], () => []);

    expect(result.eligibleUntil).toBe(
      new Date(SCHEDULED_AT.getTime() - 48 * 3_600_000).toISOString(),
    );
  });

  it('uses the largest per-service reschedule override of a multi-line booking', () => {
    const services = [
      serviceWith([], { rescheduleWindowHoursOverride: 6 }),
      serviceWith([], { rescheduleWindowHoursOverride: 72 }),
    ];
    const result = build(services, () => []);

    expect(result.eligibleUntil).toBe(
      new Date(SCHEDULED_AT.getTime() - 72 * 3_600_000).toISOString(),
    );
  });

  it('takes the strictest booking window across the booking services', () => {
    const services = [
      serviceWith([], { minBookingAdvanceHoursOverride: 12, maxBookingAdvanceDaysOverride: 30 }),
      serviceWith([], { maxBookingAdvanceDaysOverride: 45 }),
    ];
    const result = build(services, () => []);

    expect(result.window).toEqual({ minAdvanceHours: 12, maxAdvanceDays: 30 });
  });
});
