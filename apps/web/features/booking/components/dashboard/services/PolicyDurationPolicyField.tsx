'use client';

import { useTranslations } from 'next-intl';
import type { ServiceBookingPolicyItem } from '@ikaro/types';

interface PolicyDurationPolicyFieldProps {
  readonly policy: ServiceBookingPolicyItem;
  // A legged service's length is fixed by its legs — a customer-chosen duration is not offered.
  readonly hasLegs: boolean;
  readonly onPatch: (next: Partial<ServiceBookingPolicyItem>) => void;
}

// Split out of PolicyDurationPricingCard to stay under docs/CODE_STANDARDS.md's component-function
// length limit. Stays visible for a legged service (not removed), with "Cliente escolhe" disabled
// and an explanatory hint — the same precedent as the buffer field in legs mode.
export function PolicyDurationPolicyField({
  policy,
  hasLegs,
  onPatch,
}: PolicyDurationPolicyFieldProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');

  return (
    <div>
      <label
        htmlFor="policy-duration-policy"
        className="mb-1 block text-sm font-semibold text-gray-900"
      >
        {t('politicasDurationPolicyLabel')}
      </label>
      <select
        id="policy-duration-policy"
        data-testid="policy-duration-policy"
        value={policy.durationPolicy}
        onChange={(event) => {
          const durationPolicy = event.target.value as ServiceBookingPolicyItem['durationPolicy'];
          // The backend rejects pricingPolicy=PER_TIME_INCREMENT unless durationPolicy is
          // CUSTOMER_SELECTED (service.aggregate.ts's validateBookingPolicyCompleteness) —
          // switching duration back to FIXED must force pricing back to FIXED too, or a
          // manager who previously had a valid per-increment policy can never save again
          // (normalizeBookingPolicy() only clears each field's own detail fields, it never
          // resets a *different* field's governing value).
          onPatch(
            durationPolicy === 'FIXED'
              ? { durationPolicy, pricingPolicy: 'FIXED' }
              : { durationPolicy },
          );
        }}
        className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
      >
        <option value="FIXED">{t('politicasDurationPolicyFixed')}</option>
        <option value="CUSTOMER_SELECTED" disabled={hasLegs}>
          {t('politicasDurationPolicyCustomer')}
        </option>
      </select>
      <p className="mt-1 text-xs text-gray-500">
        {hasLegs ? t('politicasDurationPolicyLegsHint') : t('politicasDurationPolicyHint')}
      </p>
    </div>
  );
}
