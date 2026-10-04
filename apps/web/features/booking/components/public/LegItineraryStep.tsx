'use client';

import type React from 'react';
import { useTranslations } from 'next-intl';
import type { BasketLeg, ResourceLabel } from '@/features/booking/model/basket-lines';
import { formatDuration } from '@/shared/lib/formatting/format-duration';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';

interface LegItineraryStepProps {
  /** The journey's legs, already laid out from the line's own start (see `composeBasket`). */
  readonly legs: readonly BasketLeg[];
}

function useLabelText(): (label: ResourceLabel) => string {
  const t = useTranslations('booking.legs');
  return (label) =>
    label.kind === 'chosen'
      ? t('chosen', { name: label.name })
      : t(`autoAssigned.${label.type as 'STAFF' | 'ROOM' | 'EQUIPMENT'}`);
}

function ReservedSummary({ legs }: LegItineraryStepProps): React.JSX.Element | null {
  const t = useTranslations('booking.legs');
  const { formatTime } = useFormatting();
  const start = legs[0]?.startsAt;
  const end = legs.at(-1)?.endsAt;
  if (!start || !end) return null;

  const service = legs.reduce((sum, leg) => sum + leg.durationMinutes, 0);
  const transition = legs.reduce((sum, leg) => sum + leg.transitionGapMinutes, 0);
  const common = {
    total: formatDuration(service + transition),
    start: formatTime(start),
    end: formatTime(end),
  };
  return (
    <p className="mt-3 text-sm" style={{ color: 'var(--ba-text)' }} data-testid="leg-reserved">
      {transition === 0
        ? t('reservedNoTransition', common)
        : t('reserved', {
            ...common,
            service: formatDuration(service),
            transition: formatDuration(transition),
          })}
    </p>
  );
}

// The journey's review: each leg with its time, name, the resources it will use and the
// transition to the next — all COMPUTED from `service.legs` plus the line's start, since no
// assignment preview exists. Before booking a resource is named only when it is the customer's own
// pick; an automatic one shows its type, never a pool or unit name (the booking response names it).
export function LegItineraryStep({ legs }: LegItineraryStepProps): React.JSX.Element {
  const t = useTranslations('booking.legs');
  const { formatTime } = useFormatting();
  const labelText = useLabelText();

  return (
    <div data-testid="leg-itinerary">
      <ol
        aria-label={t('timelineLabel')}
        className="m-0 list-none border-l-2 py-0 pl-4"
        style={{ borderColor: 'var(--ba-secondary)' }}
      >
        {legs.map((leg) => (
          <li key={leg.legIndex} className="mb-4 last:mb-0" data-testid="leg-item">
            {leg.startsAt && leg.endsAt && (
              <p className="font-bold" style={{ color: 'var(--ba-text)' }}>
                {formatTime(leg.startsAt)} – {formatTime(leg.endsAt)}
              </p>
            )}
            <p className="font-semibold" style={{ color: 'var(--ba-primary)' }}>
              {leg.name}
            </p>
            {leg.resources.length > 0 && (
              <p className="text-sm opacity-75" style={{ color: 'var(--ba-text)' }}>
                {leg.resources.map(labelText).join(' · ')}
              </p>
            )}
            {leg.transitionGapMinutes > 0 && (
              <p className="mt-1 text-xs italic opacity-75" style={{ color: 'var(--ba-text)' }}>
                {t('transitionAfter', { minutes: leg.transitionGapMinutes })}
              </p>
            )}
          </li>
        ))}
      </ol>
      <ReservedSummary legs={legs} />
    </div>
  );
}
