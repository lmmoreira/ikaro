'use client';

import { useEffect, useState, type SubmitEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { StaffResponse, StaffRole } from '@ikaro/types';
import { useUpdateStaff } from '@/features/staff/hooks/useStaff';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { useDashboardTopbarStatus } from '@/shells/dashboard/components/topbar-status-context';
import { RoleSelectorField } from '@/features/staff/components/team/RoleSelectorField';
import { resolveErrorMessageFromApiError } from '@/shared/lib/i18n/resolve-error-message';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';

interface StaffDetailPageProps {
  readonly staff: StaffResponse;
}

interface StaffDetailFormErrors {
  name?: string;
  submit?: string;
}

const INPUT_CLASS =
  'w-full rounded-md border border-border bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50';

export function StaffDetailPage({ staff }: StaffDetailPageProps): React.JSX.Element {
  const t = useTranslations('dashboard.teamPage');
  const commonT = useTranslations('common');
  const dashboardT = useTranslations('dashboard');
  const locale = useResolvedLocale();
  const router = useRouter();
  const updateStaffMutation = useUpdateStaff();
  const topbarStatus = useDashboardTopbarStatus();
  const setStaffRoleStatus = topbarStatus?.setStaffRoleStatus;
  const setBackHrefOverride = topbarStatus?.setBackHrefOverride;
  const setBackLabelOverride = topbarStatus?.setBackLabelOverride;
  const setPageTitleOverride = topbarStatus?.setPageTitleOverride;
  const [name, setName] = useState(staff.name ?? '');
  const [role, setRole] = useState<StaffRole>(staff.role);
  const [fieldErrors, setFieldErrors] = useState<StaffDetailFormErrors>({});
  const [isSubmittingLocal, setIsSubmittingLocal] = useState(false);

  const isSubmitting = isSubmittingLocal || updateStaffMutation.isPending;

  useEffect(() => {
    setStaffRoleStatus?.(role);
  }, [role, setStaffRoleStatus]);

  useEffect(() => {
    setBackHrefOverride?.('/dashboard/team');
    setBackLabelOverride?.(dashboardT('nav.team'));
    setPageTitleOverride?.(staff.name ?? staff.email);

    return () => {
      setBackHrefOverride?.(null);
      setBackLabelOverride?.(null);
      setPageTitleOverride?.(null);
    };
  }, [
    staff.name,
    staff.email,
    dashboardT,
    setBackHrefOverride,
    setBackLabelOverride,
    setPageTitleOverride,
  ]);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) {
      setFieldErrors({ name: t('errors.fullNameRequired') });
      return;
    }
    setFieldErrors({});

    setIsSubmittingLocal(true);
    try {
      await updateStaffMutation.mutateAsync({
        id: staff.id,
        body: { name: trimmedName, role },
      });
      router.push('/dashboard/team');
    } catch (err) {
      setFieldErrors({ submit: resolveErrorMessageFromApiError(err, locale) });
    } finally {
      setIsSubmittingLocal(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pb-28 lg:space-y-6 lg:pb-0">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <Card>
          <CardContent className="space-y-5 p-5 lg:p-6">
            <div>
              <label
                htmlFor="staff-detail-name"
                className="mb-1.5 block text-sm font-semibold text-gray-900"
              >
                {t('fullNameLabel')}
              </label>
              <input
                id="staff-detail-name"
                data-testid="staff-detail-name-input"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby={fieldErrors.name ? 'staff-detail-name-error' : undefined}
                className={INPUT_CLASS}
              />
              {fieldErrors.name && (
                <p
                  id="staff-detail-name-error"
                  data-testid="staff-detail-name-error"
                  className="mt-1.5 text-sm text-red-600"
                >
                  {fieldErrors.name}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="staff-detail-email"
                className="mb-1.5 block text-sm font-semibold text-gray-900"
              >
                {t('emailLabel')}
              </label>
              <input
                id="staff-detail-email"
                data-testid="staff-detail-email-input"
                type="email"
                value={staff.email}
                disabled
                readOnly
                className={`${INPUT_CLASS} bg-gray-100 text-gray-500`}
              />
              <p className="mt-1.5 text-sm text-gray-500">{t('emailReadonlyHint')}</p>
            </div>

            <RoleSelectorField staffRole={role} onSelect={setRole} />

            {fieldErrors.submit && (
              <div
                data-testid="staff-detail-submit-error"
                className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {fieldErrors.submit}
              </div>
            )}
          </CardContent>
        </Card>

        <aside className="hidden lg:block lg:sticky lg:top-6">
          <Card>
            <CardContent className="space-y-4 p-4">
              <Button
                type="submit"
                data-testid="staff-detail-save-desktop"
                className="w-full"
                disabled={isSubmitting}
              >
                {isSubmitting ? commonT('loading') : commonT('save')}
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link href="/dashboard/team">{commonT('cancel')}</Link>
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white p-4 pb-[calc(0.875rem+env(safe-area-inset-bottom))] shadow-[0_-2px_8px_rgba(0,0,0,0.06)] lg:hidden">
        <div className="grid grid-cols-2 gap-3">
          <Button asChild variant="outline" className="w-full">
            <Link href="/dashboard/team">{commonT('cancel')}</Link>
          </Button>
          <Button
            type="submit"
            data-testid="staff-detail-save-mobile"
            className="w-full"
            disabled={isSubmitting}
          >
            {isSubmitting ? commonT('loading') : commonT('save')}
          </Button>
        </div>
      </div>
    </form>
  );
}
