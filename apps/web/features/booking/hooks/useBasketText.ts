'use client';

import { useTranslations } from 'next-intl';
import type {
  BasketComposition,
  BasketLine,
  ResourceLabel,
} from '@/features/booking/model/basket-lines';
import { formatDuration } from '@/shared/lib/formatting/format-duration';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';

// The words a basket is shown with, shared by the hotsite's views and the dashboard's: the
// formatting is the same, only the markup around it differs.

/** "R$ 390,00 — 3h 15min", or the "from" floor while a per-time line has no quote yet. */
export function useBasketTotalText(basket: BasketComposition): string {
  const t = useTranslations('booking');
  const { formatMoney } = useFormatting();
  return basket.isFloor
    ? `${t('summary.fromAmount', { amount: formatMoney(basket.amount) })} — ${t('summary.durationToChoose')}`
    : `${formatMoney(basket.amount)} — ${formatDuration(basket.durationMinutes)}`;
}

export function useBasketLinePrice(): (line: BasketLine) => string {
  const t = useTranslations('booking');
  const { formatMoney } = useFormatting();
  return (line) => {
    if (line.priceFormatted !== null) return line.priceFormatted;
    return line.isFloor
      ? t('summary.fromAmount', { amount: formatMoney(line.amount) })
      : formatMoney(line.amount);
  };
}

export function useResourceLabelText(): (label: ResourceLabel) => string {
  const t = useTranslations('booking.legs');
  return (label) =>
    label.kind === 'chosen'
      ? t('chosen', { name: label.name })
      : t(`autoAssigned.${label.type as 'STAFF' | 'ROOM' | 'EQUIPMENT'}`);
}
