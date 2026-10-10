'use client';

import { useTranslations } from 'next-intl';
import type { HotsiteServiceResponse } from '@ikaro/types';
import {
  buildCreateRequest,
  countOccurrences,
  type RecurringScheduleDraft,
} from '@/features/booking/model/recurring-schedule-form';
import { formatDuration } from '@/shared/lib/formatting/format-duration';
import { recurrenceEndTime } from '../../recurring-schedule-model';
import { ActionPane, NewRecurringScheduleLayout } from './NewRecurringScheduleLayout';
import { useRecurrenceText } from './use-recurrence-text';

interface NewRecurringScheduleReviewProps {
  readonly service: HotsiteServiceResponse;
  readonly draft: RecurringScheduleDraft;
  /** The chosen resource's name, for a `CUSTOMER_CHOICE` service. */
  readonly resourceName: string | null;
  readonly submitting: boolean;
  readonly onConfirm: () => void;
  readonly onBack: () => void;
}

interface FactProps {
  readonly label: string;
  readonly value: string;
  readonly testId: string;
}

function Fact({ label, value, testId }: FactProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400 sm:w-28 sm:shrink-0">
        {label}
      </dt>
      <dd data-testid={testId} className="text-sm font-medium text-gray-900">
        {value}
      </dd>
    </div>
  );
}

/** Step 2 of the creation flow: the typed pattern read back before anything is sent. */
export function NewRecurringScheduleReview({
  service,
  draft,
  resourceName,
  submitting,
  onConfirm,
  onBack,
}: NewRecurringScheduleReviewProps): React.JSX.Element {
  const tn = useTranslations('customer.recurringSchedules.new');
  const { daysText, formatDateKey } = useRecurrenceText();

  const { recurrence } = buildCreateRequest(draft, service);
  const count = countOccurrences(draft);
  const duration = formatDuration(service.durationMinutes);
  const pattern = daysText(recurrence);

  function renderPane(): React.JSX.Element {
    return (
      <ActionPane aside={tn('reviewAside')}>
        <button
          type="button"
          data-testid="new-schedule-confirm"
          disabled={submitting}
          onClick={onConfirm}
          className="rounded-lg bg-blue-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {submitting ? tn('submitting') : tn('confirmButton')}
        </button>
        <button
          type="button"
          data-testid="new-schedule-back"
          disabled={submitting}
          onClick={onBack}
          className="rounded-lg border border-gray-200 px-4 py-2.5 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          {tn('backButton')}
        </button>
      </ActionPane>
    );
  }

  return (
    <NewRecurringScheduleLayout testId="new-schedule-review" pane={renderPane()}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          {tn('stepReview')}
        </p>
        <h1 className="mt-1 text-lg font-bold text-gray-900">{tn('reviewTitle')}</h1>
      </div>

      <dl className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white px-4">
        <Fact label={tn('labelService')} value={service.name} testId="review-service" />
        {resourceName !== null && (
          <Fact label={tn('labelResource')} value={resourceName} testId="review-resource" />
        )}
        <Fact label={tn('labelPattern')} value={pattern} testId="review-pattern" />
        <Fact
          label={tn('labelTime')}
          value={tn('timeValue', {
            from: recurrence.startTime,
            to: recurrenceEndTime(recurrence),
            duration,
          })}
          testId="review-time"
        />
        <Fact
          label={tn('labelPeriod')}
          value={tn('periodValue', {
            start: formatDateKey(draft.startsOn),
            end: formatDateKey(draft.endsOn),
            count,
          })}
          testId="review-period"
        />
        <Fact
          label={tn('labelPrice')}
          value={tn('priceValue', { price: service.price.formatted })}
          testId="review-price"
        />
      </dl>

      <div className="rounded-xl border border-gray-100 bg-white p-4">
        <p className="text-sm font-semibold text-gray-900">{tn('beforeTitle')}</p>
        <p className="mt-1 text-sm leading-relaxed text-gray-600">{tn('before1', { count })}</p>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">{tn('before2')}</p>
      </div>
    </NewRecurringScheduleLayout>
  );
}
