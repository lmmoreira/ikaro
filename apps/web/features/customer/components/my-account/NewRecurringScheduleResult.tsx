'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { BookingErrorCode, type HotsiteServiceResponse } from '@ikaro/types';
import {
  countOccurrences,
  type CreateOutcome,
  type RecurringScheduleDraft,
} from '@/features/booking/model/recurring-schedule-form';
import { resolveErrorMessage } from '@/shared/lib/i18n/resolve-error-message';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import {
  recurringScheduleDetailPath,
  recurringScheduleListPath,
} from '../../recurring-schedule-model';
import { NewRecurringScheduleConflictList } from './NewRecurringScheduleConflictList';
import { ActionPane, NewRecurringScheduleLayout } from './NewRecurringScheduleLayout';
import { useRecurrenceText } from './use-recurrence-text';

/** The outcomes this component draws; a pending approval and a refused pattern have their own screens. */
export type NewScheduleResultOutcome = Extract<
  CreateOutcome,
  { kind: 'ACTIVE' | 'CONFLICT' | 'CAP_REACHED' | 'FAILURE' }
>;

interface NewRecurringScheduleResultProps {
  readonly outcome: NewScheduleResultOutcome;
  readonly service: HotsiteServiceResponse;
  readonly draft: RecurringScheduleDraft;
  readonly tenantSlug: string;
  readonly retrying: boolean;
  readonly onChangePattern: () => void;
  readonly onRetry: () => void;
}

const PRIMARY_BUTTON =
  'rounded-lg bg-blue-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60';
const SECONDARY_BUTTON =
  'rounded-lg border border-gray-200 px-4 py-2.5 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50';

function Heading({
  eyebrow,
  title,
}: {
  readonly eyebrow: string;
  readonly title: string;
}): React.JSX.Element {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{eyebrow}</p>
      <h1 className="mt-1 text-lg font-bold text-gray-900">{title}</h1>
    </div>
  );
}

export function NewRecurringScheduleResult({
  outcome,
  service,
  draft,
  tenantSlug,
  retrying,
  onChangePattern,
  onRetry,
}: NewRecurringScheduleResultProps): React.JSX.Element {
  const tn = useTranslations('customer.recurringSchedules.new');
  const locale = useResolvedLocale();
  const { formatDateKey } = useRecurrenceText();
  const listHref = recurringScheduleListPath(tenantSlug);
  const count = countOccurrences(draft);
  const start = formatDateKey(draft.startsOn);
  const end = formatDateKey(draft.endsOn);

  if (outcome.kind === 'ACTIVE') {
    const detailHref = recurringScheduleDetailPath(tenantSlug, outcome.schedule.id);
    return (
      <NewRecurringScheduleLayout
        testId="new-schedule-created"
        pane={
          <ActionPane aside={tn('createdAside')}>
            <Link href={detailHref} data-testid="new-schedule-view" className={PRIMARY_BUTTON}>
              {tn('viewSchedule')}
            </Link>
            <Link href={listHref} className={SECONDARY_BUTTON}>
              {tn('backToList')}
            </Link>
          </ActionPane>
        }
      >
        <Heading eyebrow={service.name} title={tn('createdTitle')} />
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm leading-relaxed text-green-900">
          {tn('createdBody', { count, start, end })}
        </div>
      </NewRecurringScheduleLayout>
    );
  }

  if (outcome.kind === 'CONFLICT') {
    const { conflicts } = outcome;
    const onlyOccupied = conflicts.every((conflict) => conflict.reason === 'OCCUPIED');
    const hasList = conflicts.length > 0;
    return (
      <NewRecurringScheduleLayout
        testId="new-schedule-conflict"
        pane={
          <ActionPane aside={tn('conflictAside')}>
            <button
              type="button"
              data-testid="new-schedule-change-pattern"
              onClick={onChangePattern}
              className={PRIMARY_BUTTON}
            >
              {tn('changePattern')}
            </button>
            <Link href={listHref} className={SECONDARY_BUTTON}>
              {tn('cancelButton')}
            </Link>
          </ActionPane>
        }
      >
        <Heading eyebrow={service.name} title={tn('conflictTitle')} />
        <p className="text-sm text-gray-500">{tn('conflictIntro', { start, end, count })}</p>
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
        >
          {hasList
            ? tn(onlyOccupied ? 'conflictLeadOccupied' : 'conflictLeadMixed', {
                service: service.name,
              })
            : resolveErrorMessage(BookingErrorCode.RECURRING_SCHEDULE_CONFLICT, locale)}
        </div>
        {hasList && (
          <NewRecurringScheduleConflictList
            conflicts={conflicts}
            durationMinutes={service.durationMinutes}
            title={tn(onlyOccupied ? 'conflictListOccupied' : 'conflictListMixed')}
          />
        )}
        <div className="rounded-xl border border-gray-100 bg-white p-4">
          <p className="text-sm font-semibold text-gray-900">{tn('nextTitle')}</p>
          <p className="mt-1 text-sm text-gray-600">
            {tn(onlyOccupied ? 'conflictNextOccupied' : 'conflictNextMixed')}
          </p>
        </div>
      </NewRecurringScheduleLayout>
    );
  }

  if (outcome.kind === 'CAP_REACHED') {
    return (
      <NewRecurringScheduleLayout
        testId="new-schedule-cap"
        pane={
          <ActionPane aside={tn('capAside')}>
            <button
              type="button"
              data-testid="new-schedule-change-pattern"
              onClick={onChangePattern}
              className={PRIMARY_BUTTON}
            >
              {tn('changePattern')}
            </button>
            <Link href={listHref} className={SECONDARY_BUTTON}>
              {tn('viewMine')}
            </Link>
          </ActionPane>
        }
      >
        <Heading eyebrow={service.name} title={tn('capTitle')} />
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
        >
          {tn('capBody')}
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4">
          <p className="text-sm font-semibold text-gray-900">{tn('nextTitle')}</p>
          <p className="mt-1 text-sm text-gray-600">{tn('capNext')}</p>
        </div>
      </NewRecurringScheduleLayout>
    );
  }

  return (
    <NewRecurringScheduleLayout
      testId="new-schedule-failure"
      pane={
        <ActionPane aside={tn('failureAside')}>
          <button
            type="button"
            data-testid="new-schedule-retry"
            disabled={retrying}
            onClick={onRetry}
            className={PRIMARY_BUTTON}
          >
            {retrying ? tn('submitting') : tn('retryButton')}
          </button>
          <Link href={listHref} className={SECONDARY_BUTTON}>
            {tn('cancelButton')}
          </Link>
        </ActionPane>
      }
    >
      <Heading eyebrow={service.name} title={tn('failureTitle')} />
      <div
        role="alert"
        className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
      >
        {tn('failureBody')}
      </div>
    </NewRecurringScheduleLayout>
  );
}
