'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { HotsiteServiceResponse } from '@ikaro/types';
import {
  buildCreateRequest,
  checkFirstOccurrence,
  earliestStartDate,
  refusalForFirstOccurrence,
  requiresResourceChoice,
  validateDraft,
  type CreateOutcome,
  type PatternRefusal,
  type RecurringScheduleDraft,
} from '@/features/booking/model/recurring-schedule-form';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { useCreateRecurringSchedule } from '../../hooks/useCreateRecurringSchedule';
import { useRecurringResourceOptions } from '../../hooks/useRecurringResourceOptions';
import { recurringScheduleListPath } from '../../recurring-schedule-model';
import { useCustomerTopbarStatus } from '../customer-topbar-status-context';
import { NewRecurringScheduleForm } from './NewRecurringScheduleForm';
import { NewRecurringScheduleResult } from './NewRecurringScheduleResult';
import { NewRecurringScheduleReview } from './NewRecurringScheduleReview';
import { RecurringSchedulePendingView } from './RecurringSchedulePendingView';

interface NewRecurringSchedulePageProps {
  /** The recurrence-eligible services, already filtered by the route. */
  readonly services: readonly HotsiteServiceResponse[];
  readonly tenantSlug: string;
  /** A pre-filled pattern (the renewal of an ending schedule, M23-S22); the blank form otherwise. */
  readonly initialDraft?: Partial<RecurringScheduleDraft>;
}

type Step = 'pattern' | 'review' | 'result';

/**
 * The whole creation flow on one route (M23-S17): the pattern, its review and every outcome are
 * states of this component, so the typed pattern is never lost between them.
 */
export function NewRecurringSchedulePage({
  services,
  tenantSlug,
  initialDraft,
}: NewRecurringSchedulePageProps): React.JSX.Element {
  const t = useTranslations('customer.recurringSchedules');
  const { timezone } = useFormatting();
  const topbarStatus = useCustomerTopbarStatus();
  const setBackHrefOverride = topbarStatus?.setBackHrefOverride;
  const setBackLabelOverride = topbarStatus?.setBackLabelOverride;
  const listHref = recurringScheduleListPath(tenantSlug);

  const [draft, setDraft] = useState<RecurringScheduleDraft>(() => ({
    serviceId: services[0]?.id ?? '',
    resourceId: null,
    daysOfWeek: [],
    startTime: '09:00',
    startsOn: earliestStartDate(new Date(), timezone),
    endsOn: '',
    ...initialDraft,
  }));
  const [step, setStep] = useState<Step>('pattern');
  const [showIssues, setShowIssues] = useState(false);
  const [refusal, setRefusal] = useState<PatternRefusal | null>(null);
  const [outcome, setOutcome] = useState<CreateOutcome | null>(null);
  const create = useCreateRecurringSchedule();

  useEffect(() => {
    setBackHrefOverride?.(listHref);
    setBackLabelOverride?.(t('backToList'));
    return () => {
      setBackHrefOverride?.(null);
      setBackLabelOverride?.(null);
    };
  }, [listHref, setBackHrefOverride, setBackLabelOverride, t]);

  const service = services.find((candidate) => candidate.id === draft.serviceId) ?? null;
  const needsResource = service !== null && requiresResourceChoice(service);
  const resources = useRecurringResourceOptions(tenantSlug, draft.serviceId, needsResource);
  const resourceName = needsResource
    ? (resources.data?.find((resource) => resource.resourceId === draft.resourceId)?.name ?? null)
    : null;

  // Any edit clears the previous refusal: it described the pattern as it was.
  const handleChange = useCallback((patch: Partial<RecurringScheduleDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setRefusal(null);
  }, []);

  if (service === null) {
    return (
      <NewRecurringScheduleForm
        services={services}
        tenantSlug={tenantSlug}
        draft={draft}
        onChange={handleChange}
        issues={[]}
        showIssues={false}
        refusal={null}
        onReview={() => undefined}
      />
    );
  }

  const issues = validateDraft(draft, service);

  function handleReview(): void {
    if (service === null) return;
    if (issues.length > 0) {
      setShowIssues(true);
      return;
    }
    const firstOccurrenceIssue = checkFirstOccurrence(draft, service, new Date(), timezone);
    if (firstOccurrenceIssue !== null) {
      setRefusal(refusalForFirstOccurrence(firstOccurrenceIssue));
      return;
    }
    setRefusal(null);
    setStep('review');
  }

  async function handleConfirm(): Promise<void> {
    if (service === null) return;
    const result = await create.mutateAsync(buildCreateRequest(draft, service));
    if (result.kind === 'PATTERN_REFUSED') {
      setRefusal(result.refusal);
      setShowIssues(true);
      setStep('pattern');
      return;
    }
    setOutcome(result);
    setStep('result');
  }

  function handleChangePattern(): void {
    setOutcome(null);
    setStep('pattern');
  }

  if (step === 'review') {
    return (
      <NewRecurringScheduleReview
        service={service}
        draft={draft}
        resourceName={resourceName}
        submitting={create.isPending}
        onConfirm={() => void handleConfirm()}
        onBack={() => setStep('pattern')}
      />
    );
  }

  if (step === 'result' && outcome !== null) {
    if (outcome.kind === 'PENDING_APPROVAL') {
      return (
        <RecurringSchedulePendingView
          tenantSlug={tenantSlug}
          schedule={{
            serviceName: service.name,
            recurrence: buildCreateRequest(draft, service).recurrence,
            startsOn: draft.startsOn,
            endsOn: draft.endsOn,
            approvalHoldExpiresAt: outcome.schedule.approvalHoldExpiresAt,
          }}
        />
      );
    }
    if (outcome.kind !== 'PATTERN_REFUSED') {
      return (
        <NewRecurringScheduleResult
          outcome={outcome}
          service={service}
          draft={draft}
          tenantSlug={tenantSlug}
          retrying={create.isPending}
          onChangePattern={handleChangePattern}
          onRetry={() => void handleConfirm()}
        />
      );
    }
  }

  return (
    <NewRecurringScheduleForm
      services={services}
      tenantSlug={tenantSlug}
      draft={draft}
      onChange={handleChange}
      issues={issues}
      showIssues={showIssues}
      refusal={refusal}
      onReview={handleReview}
    />
  );
}
