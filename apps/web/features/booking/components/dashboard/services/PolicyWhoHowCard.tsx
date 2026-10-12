'use client';

import { useTranslations } from 'next-intl';
import { MAX_RECURRING_HORIZON_DAYS, MIN_RECURRING_HORIZON_DAYS } from '@ikaro/types';
import type { RecurrenceBlocker } from '@/features/booking/model/recurrence-shape';
import { Card, CardContent } from '@/shared/components/ui/card';
import { parseNullableNumber, toNumberInput, type PolicyCardProps } from './policy-card-helpers';
import { isValidRecurringHorizonDays } from './recurring-horizon';

const RECURRENCE_REASON_KEY = {
  'not-appointment': 'politicasRecurrenceReasonNotAppointment',
  legs: 'politicasRecurrenceReasonLegs',
  quantity: 'politicasRecurrenceReasonQuantity',
  'pickup-address': 'politicasRecurrenceReasonPickupAddress',
  'selection-mode': 'politicasRecurrenceReasonSelectionMode',
  'customer-duration': 'politicasRecurrenceReasonCustomerDuration',
} as const satisfies Record<RecurrenceBlocker, string>;

interface PolicyWhoHowCardProps extends PolicyCardProps {
  // Why the service's shape cannot yet be booked as a recurring reservation; empty when it can.
  readonly recurrenceBlockers?: readonly RecurrenceBlocker[];
}

export function PolicyWhoHowCard({
  policy,
  onPatch,
  recurrenceBlockers = [],
}: PolicyWhoHowCardProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');
  const horizonValid = isValidRecurringHorizonDays(policy.recurringHorizonDays);

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
        {recurrenceBlockers.length > 0 && (
          <p
            role="note"
            data-testid="policy-recurrence-hint"
            className="ml-6 border-l-2 border-amber-500 pl-2.5 text-xs text-gray-600"
          >
            {t('politicasRecurrenceHint', {
              reasons: recurrenceBlockers
                .map((blocker) => t(RECURRENCE_REASON_KEY[blocker]))
                .join('; '),
            })}
          </p>
        )}
        <div className="ml-6 pb-1">
          <label
            htmlFor="policy-recurring-horizon"
            className="mb-1 block text-xs font-semibold text-gray-500"
          >
            {t('politicasHorizonLabel')}
          </label>
          <input
            id="policy-recurring-horizon"
            type="number"
            min={MIN_RECURRING_HORIZON_DAYS}
            max={MAX_RECURRING_HORIZON_DAYS}
            step={1}
            data-testid="policy-recurring-horizon"
            disabled={!policy.recurrenceEligible}
            aria-invalid={!horizonValid}
            aria-describedby={
              horizonValid
                ? 'policy-recurring-horizon-hint'
                : 'policy-recurring-horizon-hint policy-recurring-horizon-error'
            }
            aria-errormessage={horizonValid ? undefined : 'policy-recurring-horizon-error'}
            value={toNumberInput(policy.recurringHorizonDays)}
            onChange={(event) =>
              onPatch({ recurringHorizonDays: parseNullableNumber(event.target.value) })
            }
            className="w-40 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
          />
          <p id="policy-recurring-horizon-hint" className="mt-1 text-xs text-gray-500">
            {t('politicasHorizonHint')}
          </p>
          {!horizonValid && (
            <p
              id="policy-recurring-horizon-error"
              role="alert"
              data-testid="policy-recurring-horizon-error"
              className="mt-1 text-xs text-red-600"
            >
              {t('politicasHorizonError', {
                min: MIN_RECURRING_HORIZON_DAYS,
                max: MAX_RECURRING_HORIZON_DAYS,
              })}
            </p>
          )}
        </div>
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
