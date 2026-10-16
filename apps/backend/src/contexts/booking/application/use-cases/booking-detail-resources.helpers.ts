import { Booking } from '../../domain/booking.aggregate';
import { BookingLine } from '../../domain/booking-line.entity';
import { ResourceType } from '../../domain/resource.types';
import { Service } from '../../domain/service.aggregate';
import { BookingLineResourceAssignment } from '../ports/booking-repository.port';
import { BookingLineOccupancyRow } from '../ports/resource-occupancy-repository.port';
import { findRequirementForAssignment } from './future-commitment-alternatives.helpers';

// Who picked the resource. Null when the service no longer declares a requirement for that
// resource type, so a wrong tag is never shown (M23-S47 decision 3).
export type BookingResourceOrigin = 'CUSTOMER_CHOICE' | 'SYSTEM_ASSIGNED';

// One resource of a flat (non-legged) booking line. A fungible pool is one entry with the number of
// units reserved and no name: the pool never exposes which unit was reserved.
export interface BookingLineResourceEntryDetail {
  lineId: string;
  serviceName: string;
  resourceType: ResourceType;
  resourceName: string | null;
  origin: BookingResourceOrigin | null;
  quantity: number | null;
}

// One resource of one leg of a legged booking line, in leg order. The times come from the live
// occupancy row and are null once it is gone (cancel, reject, the 90-day purge): they are never
// derived from the service's current leg durations, which may have changed since the booking.
export interface BookingItineraryLegDetail {
  lineId: string;
  serviceName: string;
  legIndex: number;
  legName: string | null;
  resourceType: ResourceType;
  resourceName: string;
  startsAt: string | null;
  endsAt: string | null;
}

export interface BookingDetailResources {
  resources: BookingLineResourceEntryDetail[];
  itinerary: BookingItineraryLegDetail[];
}

export interface BuildBookingDetailResourcesParams {
  booking: Booking;
  serviceMap: ReadonlyMap<string, Service>;
  assignments: readonly BookingLineResourceAssignment[];
  occupancyRows: readonly BookingLineOccupancyRow[];
}

function originOf(selectionMode: string | undefined): BookingResourceOrigin | null {
  if (selectionMode === 'CUSTOMER_CHOICE') return 'CUSTOMER_CHOICE';
  if (selectionMode === 'AUTO_ANY') return 'SYSTEM_ASSIGNED';
  return null;
}

function poolEntry(
  lineId: string,
  serviceName: string,
  resourceType: ResourceType,
): BookingLineResourceEntryDetail {
  return { lineId, serviceName, resourceType, resourceName: null, origin: null, quantity: 1 };
}

// Collects the flat entries of a booking: one per (line, type, resource), except a fungible pool,
// which is one per (line, type) counting the units reserved.
class FlatResourceCollector {
  readonly entries: BookingLineResourceEntryDetail[] = [];
  private readonly pools = new Map<string, BookingLineResourceEntryDetail>();
  private readonly seen = new Set<string>();

  add(
    line: BookingLine,
    assignment: BookingLineResourceAssignment,
    selectionMode: string | undefined,
  ): void {
    // The default shape (a single location, no resource field) has nothing to show.
    if (selectionMode === 'NONE') return;
    if (selectionMode === 'AUTO_FUNGIBLE_POOL') this.addToPool(line, assignment);
    else this.addResource(line, assignment, selectionMode);
  }

  private addToPool(line: BookingLine, assignment: BookingLineResourceAssignment): void {
    const key = `${line.lineId}:${assignment.resourceType}`;
    const pool = this.pools.get(key);
    if (pool) {
      pool.quantity = (pool.quantity ?? 0) + 1;
      return;
    }
    const entry = poolEntry(line.lineId, line.serviceNameAtBooking, assignment.resourceType);
    this.pools.set(key, entry);
    this.entries.push(entry);
  }

  private addResource(
    line: BookingLine,
    assignment: BookingLineResourceAssignment,
    selectionMode: string | undefined,
  ): void {
    const key = `${line.lineId}:${assignment.resourceType}:${assignment.resourceId}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.entries.push({
      lineId: line.lineId,
      serviceName: line.serviceNameAtBooking,
      resourceType: assignment.resourceType,
      resourceName: assignment.resourceName,
      origin: originOf(selectionMode),
      quantity: null,
    });
  }
}

function buildFlatResources(
  params: BuildBookingDetailResourcesParams,
): BookingLineResourceEntryDetail[] {
  const { booking, serviceMap, assignments } = params;
  const collector = new FlatResourceCollector();

  for (const line of booking.lines) {
    const service = serviceMap.get(line.serviceId);
    const flatAssignments = assignments.filter(
      (a) => a.bookingLineId === line.lineId && a.legIndex === null,
    );
    for (const assignment of flatAssignments) {
      const requirement = findRequirementForAssignment(service, null, assignment.resourceType);
      collector.add(line, assignment, requirement?.selectionMode);
    }
  }
  return collector.entries;
}

function buildItinerary(params: BuildBookingDetailResourcesParams): BookingItineraryLegDetail[] {
  const { booking, serviceMap, assignments, occupancyRows } = params;
  const legs: BookingItineraryLegDetail[] = [];

  for (const line of booking.lines) {
    const service = serviceMap.get(line.serviceId);
    const lineLegs = assignments
      .filter((a) => a.bookingLineId === line.lineId && a.legIndex !== null)
      .sort((a, b) => a.legIndex! - b.legIndex! || a.resourceType.localeCompare(b.resourceType));

    for (const assignment of lineLegs) {
      const legIndex = assignment.legIndex!;
      if (
        findRequirementForAssignment(service, legIndex, assignment.resourceType)?.selectionMode ===
        'NONE'
      ) {
        continue;
      }
      const row = occupancyRows.find(
        (r) =>
          r.bookingLineId === line.lineId &&
          r.legIndex === legIndex &&
          r.resourceId === assignment.resourceId,
      );
      legs.push({
        lineId: line.lineId,
        serviceName: line.serviceNameAtBooking,
        legIndex,
        legName: service?.legs?.find((leg) => leg.legIndex === legIndex)?.name ?? null,
        resourceType: assignment.resourceType,
        resourceName: assignment.resourceName,
        startsAt: row?.startsAt.toISOString() ?? null,
        endsAt: row?.endsAt.toISOString() ?? null,
      });
    }
  }
  return legs;
}

// The resources and the itinerary of a booking detail (M23-S47). Pure: the caller supplies the
// latest assignment per slot (durable, any status), the occupancy rows that still exist, and the
// services whose current requirements decide the origin tag.
export function buildBookingDetailResources(
  params: BuildBookingDetailResourcesParams,
): BookingDetailResources {
  return { resources: buildFlatResources(params), itinerary: buildItinerary(params) };
}
