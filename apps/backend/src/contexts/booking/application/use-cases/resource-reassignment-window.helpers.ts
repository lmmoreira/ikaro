import { Booking } from '../../domain/booking.aggregate';
import { Resource } from '../../domain/resource.aggregate';
import { ResourceGap } from '../../domain/resource-gap-source';
import { AvailabilityService } from '../../domain/services/availability.service';
import { Service } from '../../domain/service.aggregate';
import { BookingLineOccupancyRow } from '../ports/resource-occupancy-repository.port';

interface ReassignBookingParams {
  booking: Booking;
  serviceMap: Map<string, Service>;
  tenantServiceBufferMinutes: number;
}

// A row moved to another resource keeps its start but not its gap: the trailing buffer/turnover
// is re-derived from the TARGET resource (M18-S10), exactly as booking creation derives it, so the
// held window — and the origin shown to the manager — describe the resource actually holding it.
export interface RetargetedWindow {
  endsAt: Date;
  gap: ResourceGap | null;
}
export type Retarget = (row: BookingLineOccupancyRow, target: Resource) => RetargetedWindow;

export function retargetedWindow(
  availabilityService: AvailabilityService,
  params: ReassignBookingParams,
  row: BookingLineOccupancyRow,
  target: Resource,
): RetargetedWindow {
  const { booking, serviceMap } = params;
  const line = booking.lines.find((l) => l.lineId === row.bookingLineId);
  const service = line ? serviceMap.get(line.serviceId) : undefined;
  if (!line || !service) return { endsAt: row.endsAt, gap: recordedGap(row) };

  if (row.legIndex !== null) {
    // A leg's trailing gap is the target resource's own turnover (the transition between legs is a
    // static service value that never depends on the resource). The leg's own work interval is the
    // persisted one — editing a service's legs later does not touch existing bookings, so the
    // current leg definition must not be used to rebuild it. A row with no recorded gap is taken as
    // having none folded into its end (a row written before the gap was recorded that held a
    // turnover is therefore held a little longer, never shorter).
    const gap = availabilityService.resolveFlatGap(0, target.turnoverMinutes);
    const rawEnd = row.endsAt.getTime() - (row.gapMinutes ?? 0) * 60_000;
    return { endsAt: new Date(rawEnd + (gap?.minutes ?? 0) * 60_000), gap };
  }

  const isLastLine = booking.lines.at(-1)?.lineId === line.lineId;
  const gap = isLastLine
    ? availabilityService.resolveFlatGap(
        service.effectiveBufferAfterMinutes(params.tenantServiceBufferMinutes),
        target.turnoverMinutes,
      )
    : null;
  const rawEnd = row.startsAt.getTime() + line.durationMinsAtBooking * 60_000;
  return { endsAt: new Date(rawEnd + (gap?.minutes ?? 0) * 60_000), gap };
}

export function recordedGap(row: BookingLineOccupancyRow): ResourceGap | null {
  return row.gapMinutes !== null && row.gapSource !== null
    ? { minutes: row.gapMinutes, source: row.gapSource }
    : null;
}
