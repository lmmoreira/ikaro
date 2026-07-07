'use client';

import Link from 'next/link';
import { useState, type SubmitEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Ban } from 'lucide-react';
import type { StaffResponse } from '@ikaro/types';
import { ApiError, ForbiddenError } from '@/shared/lib/api/errors';
import { useDeactivateStaff } from '@/features/staff/hooks/useStaff';
import { getInitials } from '@/shared/utils/initials';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';

interface DeactivateConfirmPageProps {
  readonly staff: StaffResponse;
}

type DeactivateErrorState = 'self' | 'lastManager' | 'generic' | null;

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
  readonly bodyKey: string;
  readonly hintKey: string;
}

function DeactivateErrorScreen({
  titleKey,
  bodyKey,
  hintKey,
}: DeactivateErrorScreenProps): React.JSX.Element {
  const t = useTranslations('dashboard.teamPage');

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <Card>
        <CardContent className="space-y-4 p-5 lg:p-6">
          <div className="flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
            <Ban className="h-6 w-6 shrink-0 text-red-700" />
            <div>
              <p className="font-bold text-red-800">{t(titleKey)}</p>
              <p
                data-testid="deactivate-error-body"
                className="mt-1 text-sm leading-6 text-red-800"
              >
                {t(bodyKey)}
              </p>
            </div>
          </div>
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
  const router = useRouter();
  const deactivateStaffMutation = useDeactivateStaff();
  const [isSubmittingLocal, setIsSubmittingLocal] = useState(false);
  const [errorState, setErrorState] = useState<DeactivateErrorState>(null);

  const isSubmitting = isSubmittingLocal || deactivateStaffMutation.isPending;
  const displayName = staff.name ?? staff.email;

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorState(null);

    setIsSubmittingLocal(true);
    try {
      await deactivateStaffMutation.mutateAsync(staff.id);
      router.push('/dashboard/team');
    } catch (err) {
      if (err instanceof ForbiddenError) {
        setErrorState('self');
      } else if (err instanceof ApiError && err.status === 409) {
        setErrorState('lastManager');
      } else {
        setErrorState('generic');
      }
    } finally {
      setIsSubmittingLocal(false);
    }
  }

  if (errorState === 'self') {
    return (
      <DeactivateErrorScreen
        titleKey="deactivateErrorTitle"
        bodyKey="deactivateSelfError"
        hintKey="deactivateSelfErrorHint"
      />
    );
  }

  if (errorState === 'lastManager') {
    return (
      <DeactivateErrorScreen
        titleKey="deactivateErrorTitle"
        bodyKey="updateLastManagerError"
        hintKey="deactivateLastManagerErrorHint"
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pb-28 lg:space-y-6 lg:pb-0">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <Card>
          <CardContent className="space-y-5 p-5 lg:p-6">
            <div className="space-y-1">
              <h2 className="text-[1.0625rem] font-bold text-gray-900">{t('deactivateTitle')}</h2>
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

            {errorState === 'generic' && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {t('deactivateFailed')}
              </div>
            )}
          </CardContent>
        </Card>

        <aside className="hidden lg:block lg:sticky lg:top-6">
          <Card>
            <CardContent className="space-y-4 p-4">
              <p className="text-sm leading-6 text-gray-600">{t('deactivateAsideHint')}</p>
              <DeactivateActions isSubmitting={isSubmitting} className="space-y-4" />
            </CardContent>
          </Card>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white p-4 pb-[calc(0.875rem+env(safe-area-inset-bottom))] shadow-[0_-2px_8px_rgba(0,0,0,0.06)] lg:hidden">
        <DeactivateActions isSubmitting={isSubmitting} className="grid grid-cols-2 gap-3" />
      </div>
    </form>
  );
}
