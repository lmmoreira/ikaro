'use client';

import { useTranslations } from 'next-intl';
import type {
  AvailableSlot,
  HotsiteServiceResourceOptionsRequirement,
  HotsiteServiceResponse,
  ResourceSelectionItem,
} from '@ikaro/types';
import { Card, CardContent } from '@/shared/components/ui/card';
import { useBasketLinePrice, useBasketTotalText } from '@/features/booking/hooks/useBasketText';
import { composeBasket, type ChosenDuration } from '@/features/booking/model/basket-lines';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';

interface NewBookingSummaryCardProps {
  /** Who the booking is for, as the chooser showed them. */
  readonly recipientName: string;
  readonly services: readonly HotsiteServiceResponse[];
  readonly selectedServiceIds: readonly string[];
  readonly picks: readonly ResourceSelectionItem[];
  readonly requirements: readonly HotsiteServiceResourceOptionsRequirement[];
  readonly duration: ChosenDuration | null;
  readonly slot: AvailableSlot | null;
}

// The right-hand summary of the staff steps: who, which services (with the resources staff picked
// and a legged service's stages), when, and the total — the hotsite's basket composition, worded
// by the same hooks, drawn in the dashboard's own style.
export function NewBookingSummaryCard({
  recipientName,
  services,
  selectedServiceIds,
  picks,
  requirements,
  duration,
  slot,
}: NewBookingSummaryCardProps): React.JSX.Element {
  const t = useTranslations('dashboard.newBooking.summary');
  const { formatDateLong, formatTime } = useFormatting();
  const priceOf = useBasketLinePrice();
  const basket = composeBasket({
    services,
    serviceIds: selectedServiceIds,
    picks,
    requirements,
    duration,
    slotStart: slot ? new Date(slot.startsAt) : null,
  });
  const totalText = useBasketTotalText(basket);
  const start = slot ? new Date(slot.startsAt) : null;

  return (
    <Card className="border-blue-200 bg-blue-50/70" data-testid="new-booking-summary">
      <CardContent className="space-y-3 p-4 text-sm text-blue-900">
        <p className="text-xs font-bold uppercase tracking-[0.07em] text-blue-700">
          {t('heading')}
        </p>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.07em] text-blue-700">
            {t('client')}
          </p>
          <p className="mt-1 font-medium">{recipientName}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.07em] text-blue-700">
            {t('services')}
          </p>
          {basket.lines.length === 0 ? (
            <p className="mt-1">{t('noServices')}</p>
          ) : (
            <ul className="mt-1 space-y-1" data-testid="summary-lines">
              {basket.lines.map((line) => (
                <li key={line.serviceId}>
                  <span className="flex justify-between gap-3 font-medium">
                    <span>{line.name}</span>
                    <span>{priceOf(line)}</span>
                  </span>
                  {line.resources.map((label) =>
                    label.kind === 'chosen' ? (
                      <span key={`${label.type}:${label.name}`} className="block text-xs">
                        {t('chosenResource', { name: label.name })}
                      </span>
                    ) : null,
                  )}
                  {line.legs?.map((leg) => (
                    <span key={leg.legIndex} className="block text-xs">
                      {leg.startsAt ? `${formatTime(leg.startsAt)} · ` : ''}
                      {leg.name}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.07em] text-blue-700">
            {t('dateTime')}
          </p>
          <p className="mt-1 font-medium">
            {start ? `${formatDateLong(start)} · ${formatTime(start)}` : t('dateTimePending')}
          </p>
        </div>
        {basket.lines.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.07em] text-blue-700">
              {t('total')}
            </p>
            <p className="mt-1 font-semibold" data-testid="summary-total">
              {totalText}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
