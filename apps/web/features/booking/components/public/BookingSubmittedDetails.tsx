'use client';

import type React from 'react';
import { useTranslations } from 'next-intl';
import type {
  AvailableSlot,
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
        ? [{ key: `${pick.legIndex ?? '-'}:${pick.resourceType}`, type: pick.resourceType, name }]
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
  const rows = booking.lines.map((line) => {
    const service = services.find((s) => s.id === line.serviceId);
    return {
      line,
      name: service?.name ?? '',
      resources: [...chosenRows(line, picks, requirements), ...autoAnyRow(line, service)],
    };
  });

  return (
    <section
      className="my-6 border p-4"
      style={{ borderRadius: 'var(--ba-radius)', borderColor: 'var(--ba-secondary)' }}
      data-testid="booking-submitted-details"
    >
      <h3 className="mb-2 text-lg font-bold" style={{ color: 'var(--ba-text)' }}>
        {t('submitted.heading')}
      </h3>
      {rows.map(({ line, name, resources }) => (
        <div key={line.lineId} className="mb-2" data-testid="submitted-line">
          <p className="font-semibold" style={{ color: 'var(--ba-text)' }}>
            {name}
          </p>
          <p className="text-sm" style={{ color: 'var(--ba-primary)' }}>
            {formatMoney(line.priceAtBooking.amount)} · {formatDuration(line.durationMinsAtBooking)}
          </p>
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
        {formatDateLong(new Date(selectedDate + 'T00:00:00Z'))} {t('summary.at')}{' '}
        {formatTime(new Date(selectedSlot.startsAt))}
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
