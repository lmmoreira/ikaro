'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/shared/components/ui/card';
import { PolicyNumberField } from './PolicyNumberField';
import {
  parseNullableNumber,
  toNumberInput,
  type PolicyCardProps,
  type PolicyFieldCardProps,
} from './policy-card-helpers';

export function PolicyConfirmationCard({ policy, onPatch }: PolicyCardProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <h2 className="text-sm font-semibold text-gray-900">
          {t('politicasConfirmationCardTitle')}
        </h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="policy-approval-mode"
            data-testid="policy-approval-manual"
            checked={policy.defaultApprovalMode === 'MANUAL_APPROVAL'}
            onChange={() => onPatch({ defaultApprovalMode: 'MANUAL_APPROVAL' })}
          />
          {t('politicasApprovalManual')}
        </label>
        {policy.defaultApprovalMode === 'MANUAL_APPROVAL' && (
          <div className="ml-6 max-w-[10rem]">
            <label
              htmlFor="policy-hold-minutes"
              className="mb-1 block text-xs font-semibold text-gray-500"
            >
              {t('politicasHoldMinutesLabel')}
            </label>
            <input
              id="policy-hold-minutes"
              type="number"
              min={1}
              data-testid="policy-hold-minutes"
              value={toNumberInput(policy.manualHoldMinutes)}
              onChange={(event) =>
                onPatch({ manualHoldMinutes: parseNullableNumber(event.target.value) })
              }
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
          </div>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="policy-approval-mode"
            data-testid="policy-approval-auto"
            checked={policy.defaultApprovalMode === 'AUTO_CONFIRM'}
            onChange={() => onPatch({ defaultApprovalMode: 'AUTO_CONFIRM' })}
          />
          {t('politicasApprovalAuto')}
        </label>

        <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
          <div>
            <label
              htmlFor="policy-cancellation-window"
              className="mb-1 block text-xs font-semibold text-gray-500"
            >
              {t('politicasCancellationWindowLabel')}
            </label>
            <input
              id="policy-cancellation-window"
              type="number"
              min={0}
              data-testid="policy-cancellation-window"
              value={toNumberInput(policy.cancellationWindowHoursOverride)}
              onChange={(event) =>
                onPatch({
                  cancellationWindowHoursOverride: parseNullableNumber(event.target.value),
                })
              }
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label
              htmlFor="policy-reschedule-window"
              className="mb-1 block text-xs font-semibold text-gray-500"
            >
              {t('politicasRescheduleWindowLabel')}
            </label>
            <input
              id="policy-reschedule-window"
              type="number"
              min={0}
              data-testid="policy-reschedule-window"
              value={toNumberInput(policy.rescheduleWindowHoursOverride)}
              onChange={(event) =>
                onPatch({ rescheduleWindowHoursOverride: parseNullableNumber(event.target.value) })
              }
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function PolicyBookingWindowCard({
  policy,
  fields,
  onPatch,
}: PolicyFieldCardProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <h2 className="text-sm font-semibold text-gray-900">
          {t('politicasBookingWindowCardTitle')}
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <PolicyNumberField
            name="minBookingAdvanceHoursOverride"
            id="policy-min-advance"
            testId="policy-min-advance"
            label={t('politicasMinAdvanceLabel')}
            value={policy.minBookingAdvanceHoursOverride}
            min={0}
            fields={fields}
            onChange={(value) => onPatch({ minBookingAdvanceHoursOverride: value })}
          />
          <PolicyNumberField
            name="maxBookingAdvanceDaysOverride"
            id="policy-max-advance"
            testId="policy-max-advance"
            label={t('politicasMaxAdvanceLabel')}
            value={policy.maxBookingAdvanceDaysOverride}
            min={1}
            fields={fields}
            onChange={(value) => onPatch({ maxBookingAdvanceDaysOverride: value })}
          />
        </div>
      </CardContent>
    </Card>
  );
}
