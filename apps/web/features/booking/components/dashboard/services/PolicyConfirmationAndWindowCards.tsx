'use client';

import { NumberInput } from '@/shared/components/ui/number-input';
import { Label } from '@/shared/components/ui/label';
import { Radio } from '@/shared/components/ui/radio';
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
  const tUnits = useTranslations('common.units');

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <h2 className="text-sm font-semibold text-gray-900">
          {t('politicasConfirmationCardTitle')}
        </h2>
        <label className="flex items-center gap-2 text-sm">
          <Radio
            name="policy-approval-mode"
            data-testid="policy-approval-manual"
            checked={policy.defaultApprovalMode === 'MANUAL_APPROVAL'}
            onChange={() => onPatch({ defaultApprovalMode: 'MANUAL_APPROVAL' })}
          />
          {t('politicasApprovalManual')}
        </label>
        {policy.defaultApprovalMode === 'MANUAL_APPROVAL' && (
          <div className="ml-6 max-w-[10rem]">
            <Label htmlFor="policy-hold-minutes" className="mb-1 text-xs text-gray-500">
              {t('politicasHoldMinutesLabel')}
            </Label>
            <NumberInput
              id="policy-hold-minutes"
              unit={tUnits('minutes')}
              min={1}
              data-testid="policy-hold-minutes"
              value={toNumberInput(policy.manualHoldMinutes)}
              onChange={(event) =>
                onPatch({ manualHoldMinutes: parseNullableNumber(event.target.value) })
              }
            />
          </div>
        )}
        <label className="flex items-center gap-2 text-sm">
          <Radio
            name="policy-approval-mode"
            data-testid="policy-approval-auto"
            checked={policy.defaultApprovalMode === 'AUTO_CONFIRM'}
            onChange={() => onPatch({ defaultApprovalMode: 'AUTO_CONFIRM' })}
          />
          {t('politicasApprovalAuto')}
        </label>

        <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
          <div>
            <Label htmlFor="policy-cancellation-window" className="mb-1 text-xs text-gray-500">
              {t('politicasCancellationWindowLabel')}
            </Label>
            <NumberInput
              id="policy-cancellation-window"
              unit={tUnits('hoursBefore')}
              min={0}
              data-testid="policy-cancellation-window"
              value={toNumberInput(policy.cancellationWindowHoursOverride)}
              onChange={(event) =>
                onPatch({
                  cancellationWindowHoursOverride: parseNullableNumber(event.target.value),
                })
              }
            />
          </div>
          <div>
            <Label htmlFor="policy-reschedule-window" className="mb-1 text-xs text-gray-500">
              {t('politicasRescheduleWindowLabel')}
            </Label>
            <NumberInput
              id="policy-reschedule-window"
              unit={tUnits('hoursBefore')}
              min={0}
              data-testid="policy-reschedule-window"
              value={toNumberInput(policy.rescheduleWindowHoursOverride)}
              onChange={(event) =>
                onPatch({ rescheduleWindowHoursOverride: parseNullableNumber(event.target.value) })
              }
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
  const tUnits = useTranslations('common.units');

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
            unit={tUnits('hours')}
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
            unit={tUnits('days')}
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
