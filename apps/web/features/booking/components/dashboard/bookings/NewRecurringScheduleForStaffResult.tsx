'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type {
  HotsiteServiceResourceOptionsRequirement,
  HotsiteServiceResponse,
} from '@ikaro/types';
import { NewRecurringScheduleConflictList } from '@/features/booking/components/recurring/NewRecurringScheduleConflictList';
import {
  ActionPane,
  NewRecurringScheduleLayout,
} from '@/features/booking/components/recurring/NewRecurringScheduleLayout';
import { buildResourceRecap } from '@/features/booking/components/recurring/resource-recap';
import { useRequirementText } from '@/features/booking/components/recurring/use-requirement-text';
import { useRecurrenceDescription } from '@/features/booking/hooks/useRecurrenceDescription';
import {
  countOccurrences,
  type RecurringScheduleDraft,
} from '@/features/booking/model/recurring-schedule-form';
import type { StaffCreateOutcome } from '@/features/booking/model/recurring-staff-create';
import { Button } from '@/shared/components/ui/button';

export interface StaffScheduleCustomer {
  readonly customerId: string;
  readonly name: string;
  readonly email: string;
}

type ResultOutcome = Exclude<StaffCreateOutcome, { readonly kind: 'PATTERN_REFUSED' }>;

interface NewRecurringScheduleForStaffResultProps {
  readonly outcome: ResultOutcome;
  readonly customer: StaffScheduleCustomer;
  readonly service: HotsiteServiceResponse;
  readonly draft: RecurringScheduleDraft;
  /** The resource options already read for the form, to name the picked resources. */
  readonly resourceOptions: readonly HotsiteServiceResourceOptionsRequirement[] | undefined;
  /** Back to the pattern, everything kept. */
  readonly onChangePattern: () => void;
}

const CHOOSER_HREF = '/dashboard/bookings/new?tipo=recorrencia';
const AGENDA_HREF = '/dashboard/bookings';

const PANELS = {
  ACTIVE: { copy: 'created', tone: 'ok' },
  CONFLICT: { copy: 'conflict', tone: 'error' },
  CAP_REACHED: { copy: 'cap', tone: 'error' },
  PHONE_NOT_SET: { copy: 'noPhone', tone: 'error' },
  CUSTOMER_NOT_FOUND: { copy: 'notFound', tone: 'error' },
  FAILURE: { copy: 'failure', tone: 'error' },
} as const satisfies Record<ResultOutcome['kind'], { copy: string; tone: 'ok' | 'error' }>;

const TONE_CLASSES = {
  ok: 'border-green-200 bg-green-50 text-green-900',
  error: 'border-red-200 bg-red-50 text-red-900',
} as const;

/**
 * The outcome of an accepted pattern (`09c`), one panel each. The pattern the staff member typed
 * stays visible in the recap, and a refusal never reaches here — a pattern the server refuses goes
 * back to the form (`PATTERN_REFUSED`). A staff member's schedule is created active, so there is no
 * waiting-for-approval panel.
 */
export function NewRecurringScheduleForStaffResult({
  outcome,
  customer,
  service,
  draft,
  resourceOptions,
  onChangePattern,
}: NewRecurringScheduleForStaffResultProps): React.JSX.Element {
  const tr = useTranslations('dashboard.newRecurring.result');
  const text = useRequirementText();
  const { patternLine, formatDateKey } = useRecurrenceDescription();

  const { copy, tone } = PANELS[outcome.kind];
  const resourceRows = buildResourceRecap(service, draft, resourceOptions, text);
  const recurrence = {
    frequency: 'WEEKLY' as const,
    daysOfWeek: [...draft.daysOfWeek],
    startTime: draft.startTime,
    durationMinutes: service.durationMinutes,
  };
  const from = formatDateKey(draft.startsOn);
  const to = formatDateKey(draft.endsOn);
  const params = { name: customer.name, count: countOccurrences(draft), from, to };

  const retryable =
    outcome.kind === 'CONFLICT' || outcome.kind === 'CAP_REACHED' || outcome.kind === 'FAILURE';
  const customerProblem = outcome.kind === 'PHONE_NOT_SET' || outcome.kind === 'CUSTOMER_NOT_FOUND';

  const pane = (
    <ActionPane aside={tr(`${copy}.aside`)}>
      {retryable && (
        <Button type="button" onClick={onChangePattern} data-testid="staff-schedule-change-pattern">
          {tr('changePattern')}
        </Button>
      )}
      {customerProblem && (
        <Button asChild>
          <Link href={CHOOSER_HREF} data-testid="staff-schedule-choose-other">
            {tr('chooseOther')}
          </Link>
        </Button>
      )}
      {outcome.kind === 'ACTIVE' && (
        <Button asChild>
          <Link href={AGENDA_HREF} data-testid="staff-schedule-back-to-agenda">
            {tr('backToAgenda')}
          </Link>
        </Button>
      )}
      {outcome.kind === 'ACTIVE' ? (
        <Button asChild variant="outline">
          <Link href={CHOOSER_HREF} data-testid="staff-schedule-create-another">
            {tr('createAnother')}
          </Link>
        </Button>
      ) : (
        <Button asChild variant="outline">
          <Link href={AGENDA_HREF} data-testid="staff-schedule-back-to-agenda">
            {tr('backToAgenda')}
          </Link>
        </Button>
      )}
    </ActionPane>
  );

  return (
    <NewRecurringScheduleLayout testId="staff-schedule-result" pane={pane}>
      <div
        role={tone === 'ok' ? 'status' : 'alert'}
        data-testid="staff-schedule-outcome"
        data-outcome={outcome.kind}
        className={`rounded-xl border p-4 ${TONE_CLASSES[tone]}`}
      >
        <p className="text-sm font-bold">{tr(`${copy}.title`, params)}</p>
        <p className="mt-1 text-sm leading-relaxed">{tr(`${copy}.body`, params)}</p>
      </div>

      {outcome.kind === 'CONFLICT' && outcome.conflicts.length > 0 && (
        <NewRecurringScheduleConflictList
          conflicts={outcome.conflicts}
          durationMinutes={service.durationMinutes}
          title={tr('conflict.list')}
        />
      )}

      <dl className="rounded-xl border border-gray-100 bg-white p-4 text-sm">
        <RecapRow
          label={tr('recap.customer')}
          value={customer.name}
          note={tr('recap.customerNote', { email: customer.email })}
        />
        <RecapRow label={tr('recap.service')} value={service.name} />
        {resourceRows.map((row) => (
          <RecapRow key={row.key} label={row.label} value={row.value} />
        ))}
        <RecapRow label={tr('recap.pattern')} value={patternLine(recurrence)} />
        <RecapRow label={tr('recap.period')} value={tr('recap.periodValue', { from, to })} />
        {outcome.kind === 'ACTIVE' && (
          <RecapRow label={tr('recap.count')} value={String(params.count)} />
        )}
      </dl>
    </NewRecurringScheduleLayout>
  );
}

function RecapRow({
  label,
  value,
  note,
}: {
  readonly label: string;
  readonly value: string;
  readonly note?: string;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-0.5 border-b border-gray-100 py-2 last:border-b-0 sm:flex-row sm:gap-4">
      <dt className="w-32 shrink-0 text-xs font-bold uppercase tracking-[0.07em] text-gray-400">
        {label}
      </dt>
      <dd className="text-gray-900">
        {value}
        {note !== undefined && <span className="block text-xs text-gray-500">{note}</span>}
      </dd>
    </div>
  );
}
