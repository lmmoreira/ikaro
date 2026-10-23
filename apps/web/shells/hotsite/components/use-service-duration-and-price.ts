import { useLocale, useTranslations } from 'next-intl';
import type { HotsiteServiceResponse } from '@ikaro/types';
import { formatDuration } from '@/shared/lib/formatting/format-duration';
import { formatMoney } from '@/shared/lib/formatting/format-money';
import { isPerTimeService } from '@/features/booking/model/selection-totals';

// A per-time service has no fixed price or duration: show its rate and duration range instead.
export function useServiceDurationAndPrice(service: HotsiteServiceResponse): {
  duration: string;
  price: string;
} {
  const t = useTranslations('booking');
  const locale = useLocale();
  const { bookingPolicy: policy } = service;
  if (!isPerTimeService(service) || policy.pricePerIncrementAmount === null) {
    return { duration: formatDuration(service.durationMinutes), price: service.price.formatted };
  }
  const rate = formatMoney(policy.pricePerIncrementAmount, locale, service.price.currency);
  const minutes = policy.pricingIncrementMinutes ?? 60;
  const hasRange = policy.durationMinMinutes !== null && policy.durationMaxMinutes !== null;
  return {
    duration: hasRange
      ? t('serviceSelection.durationRange', {
          min: formatDuration(policy.durationMinMinutes ?? 0),
          max: formatDuration(policy.durationMaxMinutes ?? 0),
        })
      : '',
    price:
      minutes === 60
        ? t('serviceSelection.ratePerHour', { rate })
        : t('serviceSelection.ratePerIncrement', { rate, minutes }),
  };
}
