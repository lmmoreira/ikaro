'use client';

import type React from 'react';
import { useTranslations } from 'next-intl';
import type {
  AvailableSlot,
  BookingLineItineraryLegResponse,
  BookingLineResponse,
  BookingResponse,
  HotsiteServiceResourceOptionsRequirement,
  HotsiteServiceResponse,
  ResourceSelectionItem,
  ResourceType,
} from '@ikaro/types';
import { formatDuration } from '@/shared/lib/formatting/format-duration';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';

interface BookingSubmittedDetailsProps {
  readonly services: readonly HotsiteServiceResponse[];
  readonly booking: BookingResponse;
  readonly selectedDate: string;
  readonly selectedSlot: AvailableSlot;
  readonly picks: readonly ResourceSelectionItem[];
  readonly requirements: readonly HotsiteServiceResourceOptionsRequirement[];
}

interface ResourceRow {
  readonly key: string;
  readonly type: ResourceType;
  readonly name: string;
}

const labelStyle: React.CSSProperties = { color: 'var(--ba-text)', opacity: 0.7 };

function chosenRows(
  line: BookingLineResponse,
  picks: readonly ResourceSelectionItem[],
  requirements: readonly HotsiteServiceResourceOptionsRequirement[],
): ResourceRow[] {
  return picks
    .filter((pick) => pick.serviceId === line.serviceId)
    .flatMap((pick) => {
      const name = requirements
        .find(
          (req) =>
            req.serviceId === pick.serviceId &&
            (req.legIndex ?? null) === (pick.legIndex ?? null) &&
            req.resourceType === pick.resourceType,
        )
        ?.options.find((option) => option.resourceId === pick.resourceId)?.name;
      return name
        ? [
            {
              key: `${pick.legIndex ?? '-'}:${pick.resourceType}:${pick.resourceId}`,
              type: pick.resourceType,
              name,
            },
          ]
        : [];
    });
}

// A flat AUTO_ANY requirement is the only automatic one whose resource the response names; a
// fungible pool deliberately shows no unit name.
function autoAnyRow(
  line: BookingLineResponse,
  service: HotsiteServiceResponse | undefined,
): ResourceRow[] {
  const requirement = service?.resourceRequirements.find((req) => req.selectionMode === 'AUTO_ANY');
  return line.assignedResourceName && requirement
    ? [{ key: 'auto', type: requirement.type, name: line.assignedResourceName }]
    : [];
}

interface ItineraryLeg {
  readonly legIndex: number;
  readonly name: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly resourceNames: readonly string[];
}

// The response `itinerary` lists EVERY resolved resource of EVERY leg regardless of its
// selectionMode (automatic rooms included); entries sharing a legIndex belong to one leg.
function groupItinerary(
  entries: readonly BookingLineItineraryLegResponse[],
  service: HotsiteServiceResponse | undefined,
): ItineraryLeg[] {
  const legs = new Map<number, ItineraryLeg>();
  for (const entry of entries) {
    const known = legs.get(entry.legIndex);
    legs.set(entry.legIndex, {
      legIndex: entry.legIndex,
      name: service?.legs?.find((leg) => leg.legIndex === entry.legIndex)?.name ?? '',
      startsAt: known?.startsAt ?? new Date(entry.startsAt),
      endsAt: known?.endsAt ?? new Date(entry.endsAt),
      resourceNames: [...(known?.resourceNames ?? []), entry.resourceName],
    });
  }
  return [...legs.values()].sort((a, b) => a.legIndex - b.legIndex);
}

// Lines run back-to-back from the booking's start, each by its persisted duration — the same
// cursor the backend used to place them.
function lineWindows(booking: BookingResponse): { startsAt: Date; endsAt: Date }[] {
  let cursor = new Date(booking.scheduledAt);
  return booking.lines.map((line) => {
    const startsAt = cursor;
    cursor = new Date(startsAt.getTime() + line.durationMinsAtBooking * 60_000);
    return { startsAt, endsAt: cursor };
  });
}

function ItineraryTimeline({
  legs,
}: {
  readonly legs: readonly ItineraryLeg[];
}): React.JSX.Element {
  const { formatTime } = useFormatting();
  return (
    <ol
      className="my-2 list-none border-l-2 pl-4"
      style={{ borderColor: 'var(--ba-secondary)' }}
      data-testid="booking-itinerary"
    >
      {legs.map((leg) => (
        <li key={leg.legIndex} className="mb-2 text-sm last:mb-0" data-testid="itinerary-leg">
          <strong style={{ color: 'var(--ba-text)' }}>
            {formatTime(leg.startsAt)} – {formatTime(leg.endsAt)}
          </strong>
          {leg.name && <span style={{ color: 'var(--ba-text)' }}> · {leg.name}</span>}
          <p className="opacity-75" style={{ color: 'var(--ba-text)' }}>
            {leg.resourceNames.join(' · ')}
          </p>
        </li>
      ))}
    </ol>
  );
}

// Written from the booking the server returned (price, duration and assigned names are what was
// persisted); only the customer's own picks come from the picker state. A subtle box styled with
// the business's --ba-* tokens: services, date/time, the resources that apply, the total.
export function BookingSubmittedDetails({
  services,
  booking,
  selectedDate,
  selectedSlot,
  picks,
  requirements,
}: BookingSubmittedDetailsProps): React.JSX.Element {
  const t = useTranslations('booking');
  const { formatMoney, formatDateLong, formatTime } = useFormatting();
  const hasJourney = booking.lines.some((line) => (line.itinerary?.length ?? 0) > 0);
  const windows = lineWindows(booking);
  const rows = booking.lines.map((line, index) => {
    const service = services.find((s) => s.id === line.serviceId);
    const itinerary = groupItinerary(line.itinerary ?? [], service);
    return {
      line,
      name: service?.name ?? '',
      window: windows[index],
      itinerary,
      // A journey's timeline already names every resource of every leg (the customer's own
      // picks included), so it needs no separate resource lines.
      resources:
        itinerary.length > 0
          ? []
          : [...chosenRows(line, picks, requirements), ...autoAnyRow(line, service)],
    };
  });
  const basketEnd = windows[windows.length - 1]?.endsAt;

  return (
    <section
      className="my-6 border p-4"
      style={{ borderRadius: 'var(--ba-radius)', borderColor: 'var(--ba-secondary)' }}
      data-testid="booking-submitted-details"
    >
      <h3 className="mb-2 text-lg font-bold" style={{ color: 'var(--ba-text)' }}>
        {t('submitted.heading')}
      </h3>
      {rows.map(({ line, name, window, itinerary, resources }) => (
        <div key={line.lineId} className="mb-2" data-testid="submitted-line">
          <p className="font-semibold" style={{ color: 'var(--ba-text)' }}>
            {name}
          </p>
          <p className="text-sm" style={{ color: 'var(--ba-primary)' }}>
            {formatMoney(line.priceAtBooking.amount)} · {formatDuration(line.durationMinsAtBooking)}
          </p>
          {hasJourney && window && (
            <p className="text-sm font-semibold" style={{ color: 'var(--ba-primary)' }}>
              {formatTime(window.startsAt)} – {formatTime(window.endsAt)}
            </p>
          )}
          {itinerary.length > 0 && <ItineraryTimeline legs={itinerary} />}
          {resources.map((row) => (
            <p key={row.key} className="text-sm" data-testid="submitted-resource">
              <span style={labelStyle}>{t(`resourcePicker.sectionTitle.${row.type}`)}: </span>
              <span style={{ color: 'var(--ba-text)' }}>{row.name}</span>
            </p>
          ))}
        </div>
      ))}

      <hr className="my-3" style={{ borderColor: 'var(--ba-secondary)' }} />

      <p className="text-sm" style={labelStyle}>
        {t('summary.dateTimeLabel')}
      </p>
      <p
        className="font-semibold"
        style={{ color: 'var(--ba-text)' }}
        data-testid="submitted-datetime"
      >
        {formatDateLong(new Date(selectedDate + 'T00:00:00Z'))}
        {hasJourney && basketEnd
          ? ` · ${formatTime(new Date(selectedSlot.startsAt))}–${formatTime(basketEnd)}`
          : ` ${t('summary.at')} ${formatTime(new Date(selectedSlot.startsAt))}`}
      </p>

      <p
        className="mt-3 font-semibold"
        style={{ color: 'var(--ba-text)' }}
        data-testid="submitted-total"
      >
        {t('submitted.total')}: {formatMoney(booking.totalPrice.amount)} ·{' '}
        {formatDuration(booking.totalDurationMins)}
      </p>
    </section>
  );
}
