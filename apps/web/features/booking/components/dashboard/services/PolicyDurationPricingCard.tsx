'use client';

import { useTranslations } from 'next-intl';
import type { ServiceBookingPolicyItem } from '@ikaro/types';
import { Card, CardContent } from '@/shared/components/ui/card';

function toNumberInput(value: number | null): string {
  return value === null ? '' : String(value);
}

function parseNullableNumber(value: string): number | null {
  if (value === '') return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

interface PolicyDurationPricingCardProps {
  readonly policy: ServiceBookingPolicyItem;
  readonly onPatch: (next: Partial<ServiceBookingPolicyItem>) => void;
}

export function PolicyDurationPricingCard({
  policy,
  onPatch,
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
              const durationPolicy = event.target
                .value as ServiceBookingPolicyItem['durationPolicy'];
              // The backend rejects pricingPolicy=PER_TIME_INCREMENT unless durationPolicy is
              // CUSTOMER_SELECTED (service.aggregate.ts's validateBookingPolicyCompleteness) —
              // switching duration back to FIXED must force pricing back to FIXED too, or a
              // manager who previously had a valid per-increment policy can never save again
              // (Codex finding; normalizeBookingPolicy() only clears each field's own detail
              // fields, it never resets a *different* field's governing value).
              onPatch(
                durationPolicy === 'FIXED'
                  ? { durationPolicy, pricingPolicy: 'FIXED' }
                  : { durationPolicy },
              );
            }}
            className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
          >
            <option value="FIXED">{t('politicasDurationPolicyFixed')}</option>
            <option value="CUSTOMER_SELECTED">{t('politicasDurationPolicyCustomer')}</option>
          </select>
        </div>

        {isVariableDuration && (
          <div className="grid grid-cols-3 gap-3" data-testid="policy-duration-detail">
            <div>
              <label
                htmlFor="policy-duration-min"
                className="mb-1 block text-xs font-semibold text-gray-500"
              >
                {t('politicasDurationMinLabel')}
              </label>
              <input
                id="policy-duration-min"
                type="number"
                min={1}
                data-testid="policy-duration-min"
                value={toNumberInput(policy.durationMinMinutes)}
                onChange={(event) =>
                  onPatch({ durationMinMinutes: parseNullableNumber(event.target.value) })
                }
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label
                htmlFor="policy-duration-max"
                className="mb-1 block text-xs font-semibold text-gray-500"
              >
                {t('politicasDurationMaxLabel')}
              </label>
              <input
                id="policy-duration-max"
                type="number"
                min={1}
                data-testid="policy-duration-max"
                value={toNumberInput(policy.durationMaxMinutes)}
                onChange={(event) =>
                  onPatch({ durationMaxMinutes: parseNullableNumber(event.target.value) })
                }
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label
                htmlFor="policy-duration-increment"
                className="mb-1 block text-xs font-semibold text-gray-500"
              >
                {t('politicasDurationIncrementLabel')}
              </label>
              <input
                id="policy-duration-increment"
                type="number"
                min={1}
                data-testid="policy-duration-increment"
                value={toNumberInput(policy.durationIncrementMinutes)}
                onChange={(event) =>
                  onPatch({ durationIncrementMinutes: parseNullableNumber(event.target.value) })
                }
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </div>
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
          <div className="grid grid-cols-3 gap-3" data-testid="policy-pricing-detail">
            <div>
              <label
                htmlFor="policy-pricing-increment"
                className="mb-1 block text-xs font-semibold text-gray-500"
              >
                {t('politicasPricingIncrementLabel')}
              </label>
              <input
                id="policy-pricing-increment"
                type="number"
                min={1}
                data-testid="policy-pricing-increment"
                value={toNumberInput(policy.pricingIncrementMinutes)}
                onChange={(event) =>
                  onPatch({ pricingIncrementMinutes: parseNullableNumber(event.target.value) })
                }
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label
                htmlFor="policy-price-per-increment"
                className="mb-1 block text-xs font-semibold text-gray-500"
              >
                {t('politicasPricePerIncrementLabel')}
              </label>
              <input
                id="policy-price-per-increment"
                type="number"
                min={0}
                step="0.01"
                data-testid="policy-price-per-increment"
                value={toNumberInput(policy.pricePerIncrementAmount)}
                onChange={(event) =>
                  onPatch({ pricePerIncrementAmount: parseNullableNumber(event.target.value) })
                }
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label
                htmlFor="policy-min-charge"
                className="mb-1 block text-xs font-semibold text-gray-500"
              >
                {t('politicasMinChargeLabel')}
              </label>
              <input
                id="policy-min-charge"
                type="number"
                min={0}
                step="0.01"
                data-testid="policy-min-charge"
                value={toNumberInput(policy.minimumChargeAmount)}
                onChange={(event) =>
                  onPatch({ minimumChargeAmount: parseNullableNumber(event.target.value) })
                }
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
