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

interface PolicyCardProps {
  readonly policy: ServiceBookingPolicyItem;
  readonly onPatch: (next: Partial<ServiceBookingPolicyItem>) => void;
}

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

export function PolicyBookingWindowCard({ policy, onPatch }: PolicyCardProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <h2 className="text-sm font-semibold text-gray-900">
          {t('politicasBookingWindowCardTitle')}
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="policy-min-advance"
              className="mb-1 block text-xs font-semibold text-gray-500"
            >
              {t('politicasMinAdvanceLabel')}
            </label>
            <input
              id="policy-min-advance"
              type="number"
              min={0}
              data-testid="policy-min-advance"
              value={toNumberInput(policy.minBookingAdvanceHoursOverride)}
              onChange={(event) =>
                onPatch({ minBookingAdvanceHoursOverride: parseNullableNumber(event.target.value) })
              }
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label
              htmlFor="policy-max-advance"
              className="mb-1 block text-xs font-semibold text-gray-500"
            >
              {t('politicasMaxAdvanceLabel')}
            </label>
            <input
              id="policy-max-advance"
              type="number"
              min={1}
              data-testid="policy-max-advance"
              value={toNumberInput(policy.maxBookingAdvanceDaysOverride)}
              onChange={(event) =>
                onPatch({ maxBookingAdvanceDaysOverride: parseNullableNumber(event.target.value) })
              }
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function PolicyWhoHowCard({ policy, onPatch }: PolicyCardProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');

  return (
    <Card>
      <CardContent className="space-y-2 p-5">
        <h2 className="text-sm font-semibold text-gray-900">{t('politicasWhoHowCardTitle')}</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            data-testid="policy-recurrence-eligible"
            checked={policy.recurrenceEligible}
            onChange={(event) => onPatch({ recurrenceEligible: event.target.checked })}
          />
          {t('politicasRecurrenceLabel')}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            data-testid="policy-availability-alert-eligible"
            checked={policy.availabilityAlertEligible}
            onChange={(event) => onPatch({ availabilityAlertEligible: event.target.checked })}
          />
          {t('politicasAlertLabel')}
        </label>
      </CardContent>
    </Card>
  );
}
