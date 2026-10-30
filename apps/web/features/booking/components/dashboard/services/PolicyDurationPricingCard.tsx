'use client';

import { useTranslations } from 'next-intl';
import type { ServiceBookingPolicyItem } from '@ikaro/types';
import { Card, CardContent } from '@/shared/components/ui/card';
import { PolicyDurationPolicyField } from './PolicyDurationPolicyField';
import { PolicyNumberField } from './PolicyNumberField';
import type { PolicyFieldBindings } from './policy-card-helpers';

interface PolicyDurationPricingCardProps {
  readonly policy: ServiceBookingPolicyItem;
  // A legged service's length is fixed by its legs — a customer-chosen duration is not offered.
  readonly hasLegs: boolean;
  readonly fields: PolicyFieldBindings;
  readonly onPatch: (next: Partial<ServiceBookingPolicyItem>) => void;
  // Tab intro, shown under the title so the tab's first box is the card level with the action pane.
  readonly intro?: string;
}

export function PolicyDurationPricingCard({
  policy,
  hasLegs,
  fields,
  onPatch,
  intro,
}: PolicyDurationPricingCardProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');
  const isVariableDuration = policy.durationPolicy === 'CUSTOMER_SELECTED';
  const isPerIncrementPricing = policy.pricingPolicy === 'PER_TIME_INCREMENT';

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <h2 className="text-sm font-semibold text-gray-900">
          {t('politicasDurationPricingCardTitle')}
        </h2>
        {intro && <p className="text-sm text-gray-500">{intro}</p>}

        <PolicyDurationPolicyField
          policy={policy}
          hasLegs={hasLegs}
          fields={fields}
          onPatch={onPatch}
        />

        {isVariableDuration && (
          <div className="space-y-2" data-testid="policy-duration-detail">
            <div className="grid grid-cols-3 gap-3">
              <PolicyNumberField
                name="durationMinMinutes"
                id="policy-duration-min"
                testId="policy-duration-min"
                label={t('politicasDurationMinLabel')}
                value={policy.durationMinMinutes}
                min={1}
                fields={fields}
                onChange={(value) => onPatch({ durationMinMinutes: value })}
              />
              <PolicyNumberField
                name="durationMaxMinutes"
                id="policy-duration-max"
                testId="policy-duration-max"
                label={t('politicasDurationMaxLabel')}
                value={policy.durationMaxMinutes}
                min={1}
                fields={fields}
                onChange={(value) => onPatch({ durationMaxMinutes: value })}
              />
              <PolicyNumberField
                name="durationIncrementMinutes"
                id="policy-duration-increment"
                testId="policy-duration-increment"
                label={t('politicasDurationIncrementLabel')}
                value={policy.durationIncrementMinutes}
                min={1}
                fields={fields}
                onChange={(value) => onPatch({ durationIncrementMinutes: value })}
              />
            </div>
            <p className="text-xs text-gray-500">{t('politicasDurationHint')}</p>
          </div>
        )}

        <div className="border-t border-slate-100 pt-4">
          <label
            htmlFor="policy-pricing-policy"
            className="mb-1 block text-sm font-semibold text-gray-900"
          >
            {t('politicasPricingPolicyLabel')}
          </label>
          <select
            id="policy-pricing-policy"
            data-testid="policy-pricing-policy"
            value={policy.pricingPolicy}
            disabled={!isVariableDuration}
            onChange={(event) =>
              onPatch({
                pricingPolicy: event.target.value as ServiceBookingPolicyItem['pricingPolicy'],
              })
            }
            className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="FIXED">{t('politicasPricingPolicyFixed')}</option>
            <option value="PER_TIME_INCREMENT">{t('politicasPricingPolicyIncrement')}</option>
          </select>
          <p className="mt-1 text-xs text-gray-500">{t('politicasPricingHint')}</p>
        </div>

        {isPerIncrementPricing && (
          <div className="space-y-2" data-testid="policy-pricing-detail">
            <div className="grid grid-cols-3 gap-3">
              <PolicyNumberField
                name="pricingIncrementMinutes"
                id="policy-pricing-increment"
                testId="policy-pricing-increment"
                label={t('politicasPricingIncrementLabel')}
                value={policy.pricingIncrementMinutes}
                min={1}
                fields={fields}
                onChange={(value) => onPatch({ pricingIncrementMinutes: value })}
              />
              <PolicyNumberField
                name="pricePerIncrementAmount"
                id="policy-price-per-increment"
                testId="policy-price-per-increment"
                label={t('politicasPricePerIncrementLabel')}
                value={policy.pricePerIncrementAmount}
                min={0}
                step="0.01"
                fields={fields}
                onChange={(value) => onPatch({ pricePerIncrementAmount: value })}
              />
              <PolicyNumberField
                name="minimumChargeAmount"
                id="policy-min-charge"
                testId="policy-min-charge"
                label={t('politicasMinChargeLabel')}
                value={policy.minimumChargeAmount}
                min={0}
                step="0.01"
                fields={fields}
                onChange={(value) => onPatch({ minimumChargeAmount: value })}
              />
            </div>
            <p className="text-xs text-gray-500">{t('politicasPricingDetailHint')}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
