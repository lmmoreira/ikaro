'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { HotsiteServiceResponse } from '@ikaro/types';
import {
  ActionPane,
  NewRecurringScheduleLayout,
} from '@/features/booking/components/recurring/NewRecurringScheduleLayout';
import { useResourcePicks } from '@/features/booking/components/recurring/NewRecurringScheduleResources';
import { RecurringScheduleFields } from '@/features/booking/components/recurring/RecurringScheduleFields';
import type {
  DraftIssue,
  PatternRefusal,
  RecurringScheduleDraft,
} from '@/features/booking/model/recurring-schedule-form';
import type { NoRecurrenceServicesReason } from '@/features/booking/model/recurring-service-eligibility';
import { recurringScheduleListPath } from '../../recurring-schedule-model';
import { NewRecurringScheduleNoServices } from './NewRecurringScheduleNoServices';

interface NewRecurringScheduleFormProps {
  /** Already filtered to the recurrence-eligible services. */
  readonly services: readonly HotsiteServiceResponse[];
  readonly tenantSlug: string;
  readonly draft: RecurringScheduleDraft;
  readonly onChange: (patch: Partial<RecurringScheduleDraft>) => void;
  /** What is wrong with the draft; shown only once the customer has tried to continue. */
  readonly issues: readonly DraftIssue[];
  readonly showIssues: boolean;
  /** The backend (or the first-occurrence check) refused the pattern. */
  readonly refusal: PatternRefusal | null;
  readonly onReview: () => void;
  /** Shown under the heading: the renewal banner or its not-found notice. */
  readonly header?: React.ReactNode;
  readonly title?: string;
  /** Which empty state to show when no service is offered (TD49-S03). */
  readonly emptyReason?: NoRecurrenceServicesReason;
}

/**
 * The customer's pattern step. The fields are the shared `RecurringScheduleFields`; the title, the
 * "Revisar" pane and the "how it works" text are the customer shell's own.
 */
export function NewRecurringScheduleForm({
  services,
  tenantSlug,
  draft,
  onChange,
  issues,
  showIssues,
  refusal,
  onReview,
  header,
  title,
  emptyReason = 'NONE_ENABLED',
}: NewRecurringScheduleFormProps): React.JSX.Element {
  const tn = useTranslations('customer.recurringSchedules.new');

  const service = services.find((candidate) => candidate.id === draft.serviceId) ?? null;
  const picks = useResourcePicks({ service, tenantSlug, draft, onChange });

  const aside =
    (showIssues && issues.length > 0) || refusal !== null
      ? tn('validationAside')
      : tn('draftAside');

  function renderPane(): React.JSX.Element {
    return (
      <ActionPane aside={aside}>
        <button
          type="button"
          data-testid="new-schedule-review"
          disabled={service === null || picks.blocked}
          onClick={onReview}
          className="rounded-lg bg-blue-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {tn('reviewButton')}
        </button>
        <Link
          href={recurringScheduleListPath(tenantSlug)}
          className="rounded-lg border border-gray-200 px-4 py-2.5 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          {tn('cancelButton')}
        </Link>
      </ActionPane>
    );
  }

  if (service === null) {
    return (
      <NewRecurringScheduleNoServices
        tenantSlug={tenantSlug}
        reason={emptyReason}
        header={header}
      />
    );
  }

  return (
    <NewRecurringScheduleLayout testId="new-schedule-form" pane={renderPane()}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          {tn('stepPattern')}
        </p>
        <h1 className="mt-1 text-lg font-bold text-gray-900">{title ?? tn('title')}</h1>
      </div>

      {header}

      <RecurringScheduleFields
        services={services}
        service={service}
        draft={draft}
        onChange={onChange}
        issues={issues}
        showIssues={showIssues}
        refusal={refusal}
        picks={picks}
      />

      <div className="rounded-xl border border-gray-100 bg-white p-4">
        <p className="text-sm font-semibold text-gray-900">{tn('howTitle')}</p>
        <p className="mt-1 text-sm leading-relaxed text-gray-600">{tn('howBody')}</p>
      </div>
    </NewRecurringScheduleLayout>
  );
}
