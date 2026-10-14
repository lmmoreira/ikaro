'use client';

import { useTranslations } from 'next-intl';
import type { HotsiteServiceResponse } from '@ikaro/types';
import { isPerTimeService } from '@/features/booking/model/selection-totals';
import { formatDuration } from '@/shared/lib/formatting/format-duration';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';

// How a service's price and duration are worded, shared by the hotsite's service card and the
// dashboard's. The rate is formatted in the tenant's currency, never a hard-coded one.

/** "R$ 50,00 / hora" — the per-increment rate of a per-time service; null for any other. */
export function useServiceRateText(service: HotsiteServiceResponse): string | null {
  const t = useTranslations('booking');
  const { formatMoney } = useFormatting();
  const { bookingPolicy: policy } = service;
  if (policy.pricePerIncrementAmount === null) return null;

  const rate = formatMoney(policy.pricePerIncrementAmount);
  const minutes = policy.pricingIncrementMinutes ?? 60;
  return minutes === 60
    ? t('serviceSelection.ratePerHour', { rate })
    : t('serviceSelection.ratePerIncrement', { rate, minutes });
}

export type ServicePriceText =
  | { readonly kind: 'fixed'; readonly price: string; readonly duration: string }
  | { readonly kind: 'perTime'; readonly rate: string; readonly durationRange: string | null };

/** A per-time service shows its rate and duration range; any other its fixed price and duration. */
export function useServicePriceText(service: HotsiteServiceResponse): ServicePriceText {
  const t = useTranslations('booking');
  const rate = useServiceRateText(service);
  const { bookingPolicy: policy } = service;

  if (!isPerTimeService(service) || rate === null) {
    return {
      kind: 'fixed',
      price: service.price.formatted,
      duration: formatDuration(service.durationMinutes),
    };
  }
  const hasRange = policy.durationMinMinutes !== null && policy.durationMaxMinutes !== null;
  return {
    kind: 'perTime',
    rate,
    durationRange: hasRange
      ? t('serviceSelection.durationRange', {
          min: formatDuration(policy.durationMinMinutes ?? 0),
          max: formatDuration(policy.durationMaxMinutes ?? 0),
        })
      : null,
  };
}
