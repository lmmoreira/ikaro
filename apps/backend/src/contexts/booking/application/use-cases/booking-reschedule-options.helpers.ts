import { ITransactionManager } from '../../../../shared/ports/transaction-manager.port';
import { Booking, BookingStatus } from '../../domain/booking.aggregate';
import { ResourceType } from '../../domain/resource.types';
import { Service } from '../../domain/service.aggregate';
import {
  BookingLineOccupancyRow,
  IResourceOccupancyRepository,
} from '../ports/resource-occupancy-repository.port';
import { IServiceRepository } from '../ports/service-repository.port';
import { ResourceSelectionInput } from './resource-occupancy.helpers';
import { resolveEffectiveBookingWindow, TenantBookingWindow } from './booking-window.helpers';
import { findRequirementForAssignment } from './future-commitment-alternatives.helpers';
import { resolveEffectiveRescheduleWindowHours } from './reschedule-quote.helpers';

export interface BookingRescheduleKeptPickDetail {
  serviceName: string;
  legName: string | null;
  legIndex: number | null;
  resourceType: ResourceType;
  resourceName: string;
}

export interface BookingRescheduleOptionsDetail {
  eligibleUntil: string;
  serviceIds: string[];
  resourceSelections: ResourceSelectionInput[];
  durationMinutes: number | null;
  window: { minAdvanceHours: number; maxAdvanceDays: number };
  keptPicks: BookingRescheduleKeptPickDetail[];
}

export interface BuildRescheduleOptionsParams {
  booking: Booking;
  serviceMap: Map<string, Service>;
  occupancyRows: BookingLineOccupancyRow[];
  tenantDefaultRescheduleWindowHours: number;
  tenantBookingWindow: TenantBookingWindow;
}

function isCustomerChoicePick(service: Service, row: BookingLineOccupancyRow): boolean {
  return (
    findRequirementForAssignment(service, row.legIndex, row.resourceType)?.selectionMode ===
    'CUSTOMER_CHOICE'
  );
}

function legNameOf(service: Service, legIndex: number | null): string | null {
  if (legIndex === null) return null;
  return service.legs?.find((leg) => leg.legIndex === legIndex)?.name ?? null;
}

function findKeptPicks(params: BuildRescheduleOptionsParams) {
  const { booking, serviceMap, occupancyRows } = params;
  const lineById = new Map(booking.lines.map((line) => [line.lineId, line]));
  return occupancyRows.flatMap((row) => {
    const line = lineById.get(row.bookingLineId);
    const service = line ? serviceMap.get(line.serviceId) : undefined;
    if (!line || !service || !isCustomerChoicePick(service, row)) return [];
    return [{ line, service, row }];
  });
}

export function buildRescheduleOptions(
  params: BuildRescheduleOptionsParams,
): BookingRescheduleOptionsDetail {
  const { booking, serviceMap, tenantDefaultRescheduleWindowHours, tenantBookingWindow } = params;
  const windowHours = resolveEffectiveRescheduleWindowHours(
    booking,
    serviceMap,
    tenantDefaultRescheduleWindowHours,
  );
  const picks = findKeptPicks(params);
  const selectedDurationLine = booking.lines.find(
    (line) => serviceMap.get(line.serviceId)?.bookingPolicy.durationPolicy === 'CUSTOMER_SELECTED',
  );

  return {
    eligibleUntil: booking.rescheduleEligibleUntil(windowHours).toISOString(),
    serviceIds: [...new Set(booking.lines.map((line) => line.serviceId))],
    resourceSelections: picks.map(({ line, row }) => ({
      serviceId: line.serviceId,
      legIndex: row.legIndex,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
    })),
    durationMinutes: selectedDurationLine?.durationMinsAtBooking ?? null,
    window: resolveEffectiveBookingWindow(tenantBookingWindow, serviceMap.values()),
    keptPicks: picks.map(({ line, service, row }) => ({
      serviceName: line.serviceNameAtBooking,
      legName: legNameOf(service, row.legIndex),
      legIndex: row.legIndex,
      resourceType: row.resourceType,
      resourceName: row.resourceName,
    })),
  };
}

export interface LoadRescheduleOptionsDeps {
  serviceRepo: IServiceRepository;
  occupancyRepo: IResourceOccupancyRepository;
  txManager: ITransactionManager;
}

// The customer reschedule screen's input, loaded for an APPROVED booking only (null otherwise).
export async function loadRescheduleOptions(
  deps: LoadRescheduleOptionsDeps,
  params: Omit<BuildRescheduleOptionsParams, 'serviceMap' | 'occupancyRows'>,
): Promise<BookingRescheduleOptionsDetail | null> {
  const { booking } = params;
  if (booking.status !== BookingStatus.APPROVED) return null;

  const serviceIds = [...new Set(booking.lines.map((line) => line.serviceId))];
  const [services, occupancyRows] = await Promise.all([
    deps.serviceRepo.findByIds(serviceIds, booking.tenantId),
    // The occupancy repository only works inside a transaction, reads included.
    deps.txManager.run(() =>
      deps.occupancyRepo.findOccupancyByBookingLines(
        booking.tenantId,
        booking.lines.map((line) => line.lineId),
      ),
    ),
  ]);

  return buildRescheduleOptions({
    ...params,
    serviceMap: new Map(services.map((service) => [service.id, service])),
    occupancyRows,
  });
}
