'use client';

import Link from 'next/link';
import { useState, type SubmitEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { StaffErrorCode, type StaffResponse } from '@ikaro/types';
import { useDeactivateStaff } from '@/features/staff/hooks/useStaff';
import { getInitials } from '@/shared/utils/initials';
import { Button } from '@/shared/components/ui/button';
import { ActionPane } from '@/shared/components/ui/action-pane';
import { Card, CardContent } from '@/shared/components/ui/card';
import { FeedbackMessage } from '@/shared/components/ui/feedback-message';
import { useFormFeedback } from '@/shared/lib/feedback/use-form-feedback';
import { extractProblemCode, resolveErrorMessage } from '@/shared/lib/i18n/resolve-error-message';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';

interface DeactivateConfirmPageProps {
  readonly staff: StaffResponse;
}

interface DeactivateActionsProps {
  readonly isSubmitting: boolean;
  readonly className: string;
}

function DeactivateActions({ isSubmitting, className }: DeactivateActionsProps): React.JSX.Element {
  const t = useTranslations('dashboard.teamPage');
  const commonT = useTranslations('common');
  const router = useRouter();

  return (
    <div className={className}>
      <Button variant="destructive" type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? commonT('loading') : t('deactivateConfirm')}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => router.back()}
        disabled={isSubmitting}
      >
        {commonT('cancel')}
      </Button>
    </div>
  );
}

interface DeactivateErrorScreenProps {
  readonly titleKey: string;
  readonly bodyMessage: string;
  readonly hintKey: string;
}

function DeactivateErrorScreen({
  titleKey,
  bodyMessage,
  hintKey,
}: DeactivateErrorScreenProps): React.JSX.Element {
  const t = useTranslations('dashboard.teamPage');

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <Card>
        <CardContent className="space-y-4 p-5 lg:p-6">
          <FeedbackMessage title={t(titleKey)} testId="page-feedback">
            {bodyMessage}
          </FeedbackMessage>
          <p className="text-sm leading-6 text-gray-600">{t(hintKey)}</p>
          <Button asChild variant="outline" className="w-full">
            <Link href="/dashboard/team">{t('backToTeam')}</Link>
          </Button>
        </CardContent>
      </Card>

      <aside className="hidden lg:block lg:sticky lg:top-6">
        <Card>
          <CardContent className="space-y-4 p-4">
            <p className="text-sm leading-6 text-gray-600">{t(hintKey)}</p>
            <Button asChild variant="outline" className="w-full">
              <Link href="/dashboard/team">{t('backToTeam')}</Link>
            </Button>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

export function DeactivateConfirmPage({ staff }: DeactivateConfirmPageProps): React.JSX.Element {
  const t = useTranslations('dashboard.teamPage');
  const locale = useResolvedLocale();
  const router = useRouter();
  const deactivateStaffMutation = useDeactivateStaff();
  const [isSubmittingLocal, setIsSubmittingLocal] = useState(false);
  const feedback = useFormFeedback();
  // The two refusals no retry can fix (self, last manager) replace the form with their own screen.
  const [blockedCode, setBlockedCode] = useState<string | null>(null);

  const isSubmitting = isSubmittingLocal || deactivateStaffMutation.isPending;
  const displayName = staff.name ?? staff.email;

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    feedback.clear();

    setIsSubmittingLocal(true);
    try {
      await deactivateStaffMutation.mutateAsync(staff.id);
      router.push('/dashboard/team');
    } catch (err) {
      const code = extractProblemCode(err);
      if (
        code === StaffErrorCode.SELF_DEACTIVATION ||
        code === StaffErrorCode.LAST_ACTIVE_MANAGER
      ) {
        setBlockedCode(code);
      } else {
        feedback.setFromApiError(err, locale);
      }
    } finally {
      setIsSubmittingLocal(false);
    }
  }

  if (blockedCode) {
    return (
      <DeactivateErrorScreen
        titleKey="deactivateErrorTitle"
        bodyMessage={resolveErrorMessage(blockedCode, locale)}
        hintKey={
          blockedCode === StaffErrorCode.SELF_DEACTIVATION
            ? 'deactivateSelfErrorHint'
            : 'deactivateLastManagerErrorHint'
        }
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pb-28 lg:space-y-6 lg:pb-0">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <Card>
          <CardContent className="space-y-5 p-5 lg:p-6">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-gray-900">{t('deactivateTitle')}</h2>
              <p className="text-sm text-gray-500">
                {t('deactivateSubtitle', { name: displayName })}
              </p>
            </div>

            <div className="flex items-center gap-3.5 rounded-2xl bg-slate-50 px-4 py-4">
              <span
                aria-hidden="true"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600"
              >
                {getInitials(staff.name)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-gray-900">{displayName}</p>
                <p className="truncate text-sm text-gray-500">
                  {staff.email} · {staff.role === 'MANAGER' ? t('roleManager') : t('roleStaff')}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
              <p className="flex items-center gap-2 text-sm font-bold text-amber-900">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {t('deactivateWarningTitle')}
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-amber-900/90">
                <li>{t('deactivateWarningLoseAccess')}</li>
                <li>{t('deactivateWarningHistory')}</li>
                <li>{t('deactivateWarningReinvite')}</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <ActionPane
          actions={
            <>
              <p className="text-sm leading-6 text-gray-600">{t('deactivateAsideHint')}</p>
              <DeactivateActions isSubmitting={isSubmitting} className="space-y-4" />
            </>
          }
          mobileActions={
            <DeactivateActions isSubmitting={isSubmitting} className="grid grid-cols-2 gap-3" />
          }
          feedback={feedback.feedback}
        />
      </div>
    </form>
  );
}
