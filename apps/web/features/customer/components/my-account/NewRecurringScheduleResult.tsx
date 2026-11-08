'use client';

import { PageHeader } from '@/shared/components/ui/page-header';
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
import { NewRecurringScheduleConflictList } from '@/features/booking/components/recurring/NewRecurringScheduleConflictList';
import {
  ActionPane,
  NewRecurringScheduleLayout,
} from '@/features/booking/components/recurring/NewRecurringScheduleLayout';
import { Button } from '@/shared/components/ui/button';
import { FeedbackMessage } from '@/shared/components/ui/feedback-message';
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

function ListLinkButton({
  href,
  children,
}: {
  readonly href: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Button asChild variant="outline" className="w-full">
      <Link href={href}>{children}</Link>
    </Button>
  );
}

function Heading({
  eyebrow,
  title,
}: {
  readonly eyebrow: string;
  readonly title: string;
}): React.JSX.Element {
  return <PageHeader eyebrow={eyebrow} title={title} />;
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
            <Button asChild className="w-full">
              <Link href={detailHref} data-testid="new-schedule-view">
                {tn('viewSchedule')}
              </Link>
            </Button>
            <ListLinkButton href={listHref}>{tn('backToList')}</ListLinkButton>
          </ActionPane>
        }
      >
        <h1 className="sr-only">{tn('createdTitle')}</h1>
        <FeedbackMessage
          variant="success"
          title={tn('createdTitle')}
          hint={service.name}
          testId="new-schedule-created-message"
        >
          {tn('createdBody', { count, start, end })}
        </FeedbackMessage>
      </NewRecurringScheduleLayout>
    );
  }

  if (outcome.kind === 'CONFLICT') {
    const { conflicts } = outcome;
    const onlyOccupied = conflicts.every((conflict) => conflict.reason === 'OCCUPIED');
    const hasList = conflicts.length > 0;
    const leadKey = onlyOccupied ? 'conflictLeadOccupied' : 'conflictLeadMixed';
    const lead = hasList
      ? tn(leadKey, { service: service.name })
      : resolveErrorMessage(BookingErrorCode.RECURRING_SCHEDULE_CONFLICT, locale);
    return (
      <NewRecurringScheduleLayout
        testId="new-schedule-conflict"
        pane={
          <ActionPane aside={tn('conflictAside')}>
            <Button
              type="button"
              data-testid="new-schedule-change-pattern"
              onClick={onChangePattern}
              className="w-full"
            >
              {tn('changePattern')}
            </Button>
            <ListLinkButton href={listHref}>{tn('cancelButton')}</ListLinkButton>
          </ActionPane>
        }
      >
        <Heading eyebrow={service.name} title={tn('conflictTitle')} />
        <p className="text-sm text-gray-500">{tn('conflictIntro', { start, end, count })}</p>
        <FeedbackMessage title={lead} testId="new-schedule-conflict-message" />
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
            <Button
              type="button"
              data-testid="new-schedule-change-pattern"
              onClick={onChangePattern}
              className="w-full"
            >
              {tn('changePattern')}
            </Button>
            <ListLinkButton href={listHref}>{tn('viewMine')}</ListLinkButton>
          </ActionPane>
        }
      >
        <Heading eyebrow={service.name} title={tn('capTitle')} />
        <FeedbackMessage title={tn('capBody')} testId="new-schedule-cap-message" />
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
      feedback={{
        variant: 'error',
        title: tn('failureBody'),
        testId: 'new-schedule-failure-message',
      }}
      pane={
        <ActionPane aside={tn('failureAside')}>
          <Button
            type="button"
            data-testid="new-schedule-retry"
            disabled={retrying}
            onClick={onRetry}
            className="w-full"
          >
            {retrying ? tn('submitting') : tn('retryButton')}
          </Button>
          <ListLinkButton href={listHref}>{tn('cancelButton')}</ListLinkButton>
        </ActionPane>
      }
    >
      <Heading eyebrow={service.name} title={tn('failureTitle')} />
    </NewRecurringScheduleLayout>
  );
}
