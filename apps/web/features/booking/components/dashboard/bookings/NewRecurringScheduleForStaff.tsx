'use client';

import { PageHeader } from '@/shared/components/ui/page-header';
import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { HotsiteServiceResponse } from '@ikaro/types';
import {
  ActionPane,
  NewRecurringScheduleLayout,
} from '@/features/booking/components/recurring/NewRecurringScheduleLayout';
import { useResourcePicks } from '@/features/booking/components/recurring/NewRecurringScheduleResources';
import { useRecurringFormFeedback } from '@/features/booking/components/recurring/use-recurring-form-feedback';
import { RecurringScheduleFields } from '@/features/booking/components/recurring/RecurringScheduleFields';
import { useCreateRecurringScheduleAsStaff } from '@/features/booking/hooks/useRecurringSchedules';
import {
  earliestStartDate,
  refusalForFirstOccurrence,
  validateDraft,
  type PatternRefusal,
  type RecurringScheduleDraft,
} from '@/features/booking/model/recurring-schedule-form';
import type { NoRecurrenceServicesReason } from '@/features/booking/model/recurring-service-eligibility';
import {
  buildStaffCreateRequest,
  checkStaffFirstOccurrence,
  type StaffCreateOutcome,
} from '@/features/booking/model/recurring-staff-create';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { NewRecurringScheduleForStaffNoServices } from './NewRecurringScheduleForStaffNoServices';
import {
  NewRecurringScheduleForStaffResult,
  type StaffScheduleCustomer,
} from './NewRecurringScheduleForStaffResult';

interface NewRecurringScheduleForStaffProps {
  /** The recurrence-eligible services, already filtered by the route. */
  readonly services: readonly HotsiteServiceResponse[];
  /** Which empty state to show when `services` is empty. */
  readonly emptyReason: NoRecurrenceServicesReason;
  readonly tenantSlug: string;
  /** The registered customer chosen in the chooser (`?customerId=`). */
  readonly customer: StaffScheduleCustomer;
}

const CHOOSER_HREF = '/dashboard/bookings/new?tipo=recorrencia';

/**
 * `/dashboard/bookings/recurring/new` (UC-070, M23-S19): staff create a recurring reservation for
 * the customer they chose. The fields are the shared `RecurringScheduleFields`; what is the staff
 * shell's own is the customer chip, the direct "Criar recorrência" (no review step — staff know the
 * pattern and the server checks every occurrence), and the outcome panels. Staff are exempt from
 * the booking window, so only the past and no-occurrence rules run before sending.
 */
export function NewRecurringScheduleForStaff({
  services,
  emptyReason,
  tenantSlug,
  customer,
}: NewRecurringScheduleForStaffProps): React.JSX.Element {
  const t = useTranslations('dashboard.newRecurring');
  const { timezone } = useFormatting();
  const create = useCreateRecurringScheduleAsStaff();

  const [draft, setDraft] = useState<RecurringScheduleDraft>(() => ({
    serviceId: services[0]?.id ?? '',
    resourceIds: [],
    daysOfWeek: [],
    startTime: '09:00',
    startsOn: earliestStartDate(new Date(), timezone),
    endsOn: '',
  }));
  const [showIssues, setShowIssues] = useState(false);
  const [refusal, setRefusal] = useState<PatternRefusal | null>(null);
  const [outcome, setOutcome] = useState<Exclude<
    StaffCreateOutcome,
    { kind: 'PATTERN_REFUSED' }
  > | null>(null);

  // Any edit clears the previous refusal: it described the pattern as it was.
  const service = services.find((candidate) => candidate.id === draft.serviceId) ?? null;
  const feedback = useRecurringFormFeedback(service, draft);
  const { clear: clearFeedback, present } = feedback;

  const handleChange = useCallback(
    (patch: Partial<RecurringScheduleDraft>) => {
      setDraft((current) => ({ ...current, ...patch }));
      setRefusal(null);
      clearFeedback();
    },
    [clearFeedback],
  );

  const picks = useResourcePicks({ service, tenantSlug, draft, onChange: handleChange });

  if (service === null) {
    return (
      <NewRecurringScheduleForStaffNoServices
        reason={emptyReason}
        customerId={customer.customerId}
        customerName={customer.name}
      />
    );
  }

  if (outcome !== null) {
    return (
      <NewRecurringScheduleForStaffResult
        outcome={outcome}
        customer={customer}
        service={service}
        draft={draft}
        resourceOptions={picks.options}
        onChangePattern={() => setOutcome(null)}
      />
    );
  }

  const issues = validateDraft(draft, service);

  async function handleCreate(): Promise<void> {
    if (service === null) return;
    if (issues.length > 0) {
      setShowIssues(true);
      present(issues, null);
      return;
    }
    const firstOccurrenceIssue = checkStaffFirstOccurrence(draft, new Date(), timezone);
    if (firstOccurrenceIssue !== null) {
      const firstOccurrenceRefusal = refusalForFirstOccurrence(firstOccurrenceIssue);
      setRefusal(firstOccurrenceRefusal);
      present(issues, firstOccurrenceRefusal);
      return;
    }
    setRefusal(null);
    clearFeedback();
    const result = await create.mutateAsync(
      buildStaffCreateRequest(draft, service, customer.customerId),
    );
    if (result.kind === 'PATTERN_REFUSED') {
      setRefusal(result.refusal);
      setShowIssues(true);
      present(issues, result.refusal);
      return;
    }
    setOutcome(result);
  }

  const aside =
    (showIssues && issues.length > 0) || refusal !== null ? t('asideValidation') : t('asideDraft');

  const pane = (
    <ActionPane aside={aside}>
      <Button
        type="button"
        data-testid="new-schedule-create"
        disabled={picks.blocked || create.isPending}
        onClick={() => void handleCreate()}
      >
        {create.isPending ? t('creating') : t('createButton')}
      </Button>
      <Button asChild variant="outline">
        <Link href="/dashboard/bookings" data-testid="new-schedule-back">
          {t('backButton')}
        </Link>
      </Button>
    </ActionPane>
  );

  return (
    <NewRecurringScheduleLayout
      testId="new-schedule-staff-form"
      pane={pane}
      feedback={feedback.feedback}
    >
      <Card data-testid="recipient-header">
        <CardContent className="flex flex-col gap-4 p-4">
          <PageHeader eyebrow={t('stepPattern')} title={t('title')} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900">{customer.name}</p>
              <p className="truncate text-xs text-gray-500">
                {t('customerNote', { email: customer.email })}
              </p>
            </div>
            <Link
              href={CHOOSER_HREF}
              className="text-sm font-semibold text-blue-700 hover:underline"
              data-testid="change-recipient"
            >
              {t('changeCustomer')}
            </Link>
          </div>
        </CardContent>
      </Card>

      <RecurringScheduleFields
        services={services}
        service={service}
        draft={draft}
        onChange={handleChange}
        form={feedback}
        picks={picks}
      />

      <div className="rounded-xl border border-gray-100 bg-white p-4">
        <p className="text-sm font-semibold text-gray-900">{t('howTitle')}</p>
        <p className="mt-1 text-sm leading-relaxed text-gray-600">{t('howBody')}</p>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">{t('howApproval')}</p>
      </div>
    </NewRecurringScheduleLayout>
  );
}
