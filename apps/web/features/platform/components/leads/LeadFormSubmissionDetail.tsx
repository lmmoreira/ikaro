'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import type { LeadFormSubmissionDetailResponse } from '@ikaro/types';
import { Card } from '@/shared/components/ui/card';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { useDashboardTopbarStatus } from '@/shells/dashboard/components/topbar-status-context';

interface LeadFormSubmissionDetailProps {
  readonly submission: LeadFormSubmissionDetailResponse;
}

function formatAnswerValue(value: string | readonly string[]): string {
  return typeof value === 'string' ? value : value.join(', ');
}

// Read-only — no edit/delete affordance (UC-041 postconditions: the retention cron, UC-043, is
// the only deletion path).
export function LeadFormSubmissionDetail({
  submission,
}: LeadFormSubmissionDetailProps): React.JSX.Element {
  const t = useTranslations('dashboard.leadsPage');
  const dashboardT = useTranslations('dashboard');
  const { formatDate, formatTime } = useFormatting();
  const topbarStatus = useDashboardTopbarStatus();
  const setBackHrefOverride = topbarStatus?.setBackHrefOverride;
  const setBackLabelOverride = topbarStatus?.setBackLabelOverride;
  const setPageTitleOverride = topbarStatus?.setPageTitleOverride;

  useEffect(() => {
    setBackHrefOverride?.('/dashboard/leads');
    setBackLabelOverride?.(dashboardT('nav.leads'));
    setPageTitleOverride?.(submission.name);

    return () => {
      setBackHrefOverride?.(null);
      setBackLabelOverride?.(null);
      setPageTitleOverride?.(null);
    };
  }, [
    submission.name,
    dashboardT,
    setBackHrefOverride,
    setBackLabelOverride,
    setPageTitleOverride,
  ]);

  const submittedAtDate = new Date(submission.submittedAt);
  const submitterLabel =
    submission.customerId === null ? t('guestSubmitter') : t('customerSubmitter');

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.06em] text-gray-400">
          {t('contactSectionTitle')}
        </p>
        <p className="text-base font-bold text-gray-900">{submission.name}</p>
        <p className="mt-1 text-sm text-gray-700">{submission.email}</p>
        <p className="text-sm text-gray-700">{submission.phone}</p>
        <p className="mt-3 text-xs text-gray-400">
          {t('submittedAtLabel', {
            date: formatDate(submittedAtDate),
            time: formatTime(submittedAtDate),
          })}{' '}
          · {submitterLabel}
        </p>
      </Card>

      <Card className="p-5">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.06em] text-gray-400">
          {t('answersSectionTitle')}
        </p>
        <div className="divide-y divide-border" data-testid="lead-detail-answers">
          {submission.answers.map((answer, index) => (
            <div key={`${answer.questionLabel}-${index}`} className="py-3 first:pt-0 last:pb-0">
              <p className="text-sm font-semibold text-gray-900">{answer.questionLabel}</p>
              <p className="mt-1 text-sm text-gray-700">{formatAnswerValue(answer.answerValue)}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
