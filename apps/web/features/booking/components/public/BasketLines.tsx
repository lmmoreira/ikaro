'use client';

import type React from 'react';
import { useTranslations } from 'next-intl';
import type { BasketComposition, BasketLine } from '@/features/booking/model/basket-lines';
import { formatDuration } from '@/shared/lib/formatting/format-duration';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { LegItineraryStep } from './LegItineraryStep';

const textStyle: React.CSSProperties = { color: 'var(--ba-text)' };

/** "R$ 390,00 — 3h 15min", or the "from" floor while a per-time line has no quote yet. */
export function useBasketTotalText(basket: BasketComposition): string {
  const t = useTranslations('booking');
  const { formatMoney } = useFormatting();
  return basket.isFloor
    ? `${t('summary.fromAmount', { amount: formatMoney(basket.amount) })} — ${t('summary.durationToChoose')}`
    : `${formatMoney(basket.amount)} — ${formatDuration(basket.durationMinutes)}`;
}

function useLinePrice(): (line: BasketLine) => string {
  const t = useTranslations('booking');
  const { formatMoney } = useFormatting();
  return (line) => {
    if (line.priceFormatted !== null) return line.priceFormatted;
    return line.isFloor
      ? t('summary.fromAmount', { amount: formatMoney(line.amount) })
      : formatMoney(line.amount);
  };
}

// A line's own window — shown only for a basket with a journey, whose timeline already carries
// times, so the other lines need theirs to be read in sequence.
function LineRange({ line }: { readonly line: BasketLine }): React.JSX.Element | null {
  const { formatTime } = useFormatting();
  if (!line.startsAt || !line.endsAt || line.durationMinutes === null) return null;
  return (
    <p className="text-sm font-semibold" style={{ color: 'var(--ba-primary)' }}>
      {formatTime(line.startsAt)} – {formatTime(line.endsAt)} ·{' '}
      {formatDuration(line.durationMinutes)}
    </p>
  );
}

function OwnPicks({ line }: { readonly line: BasketLine }): React.JSX.Element | null {
  const t = useTranslations('booking.legs');
  if (line.resources.length === 0) return null;
  return (
    <>
      {line.resources.map((label) =>
        label.kind === 'chosen' ? (
          <p
            key={`${label.type}:${label.name}`}
            className="text-sm opacity-75"
            style={textStyle}
            data-testid="line-own-pick"
          >
            {t('chosen', { name: label.name })}
          </p>
        ) : null,
      )}
    </>
  );
}

interface BasketLinesProps {
  readonly basket: BasketComposition;
  /** `confirmation`: the journey as a full timeline. `summary`: the journey as one compact row. */
  readonly variant: 'summary' | 'confirmation';
}

// One row per line of the basket — the shared composition behind the summary card and the
// Confirmation step (the success box renders the same lines from the booking response).
export function BasketLines({ basket, variant }: BasketLinesProps): React.JSX.Element {
  const t = useTranslations('booking.legs');
  const priceOf = useLinePrice();

  return (
    <ul className="mb-4 flex flex-col gap-2" data-testid="basket-lines">
      {basket.lines.map((line) => (
        <li key={line.serviceId} className="text-sm" data-testid="basket-line" style={textStyle}>
          <div className="flex justify-between gap-4">
            <span className={basket.hasJourney ? 'font-semibold' : undefined}>{line.name}</span>
            <span>{priceOf(line)}</span>
          </div>
          {variant === 'confirmation' && <OwnPicks line={line} />}
          {basket.hasJourney && <LineRange line={line} />}
          {line.legs && variant === 'confirmation' && (
            <div className="mt-2">
              <LegItineraryStep legs={line.legs} />
            </div>
          )}
          {line.legs && variant === 'summary' && (
            <p className="text-sm opacity-75">
              {t('stagesList', {
                count: line.legs.length,
                names: line.legs.map((leg) => leg.name).join(' · '),
              })}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
