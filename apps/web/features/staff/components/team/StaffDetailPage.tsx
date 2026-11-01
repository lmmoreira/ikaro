'use client';

import { useEffect, useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { StaffResponse, StaffRole } from '@ikaro/types';
import { useUpdateStaff } from '@/features/staff/hooks/useStaff';
import { Card, CardContent } from '@/shared/components/ui/card';
import { FIELD_INVALID_CLASS, FieldFeedback } from '@/shared/components/ui/field-feedback';
import { FormActionPane } from '@/shared/components/ui/form-action-pane';
import { useDashboardTopbarStatus } from '@/shells/dashboard/components/topbar-status-context';
import { RoleSelectorField } from '@/features/staff/components/team/RoleSelectorField';
import { useFormFeedback } from '@/shared/lib/feedback/use-form-feedback';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { cn } from '@/shared/utils/cn';

interface StaffDetailPageProps {
  readonly staff: StaffResponse;
}

const INPUT_CLASS =
  'w-full rounded-md border border-border bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

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
  const feedback = useFormFeedback();
  const { fieldProps, fieldErrors, fieldErrorId, edit, clear: clearFeedback } = feedback;
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
    clearFeedback();

    const trimmedName = name.trim();
    if (!trimmedName) {
      feedback.setFieldErrors({ name: t('errors.fullNameRequired') });
      return;
    }

    setIsSubmittingLocal(true);
    try {
      await updateStaffMutation.mutateAsync({
        id: staff.id,
        body: { name: trimmedName, role },
      });
      router.push('/dashboard/team');
    } catch (err) {
      feedback.setFromApiError(err, locale);
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
                onChange={(event) => edit(setName)(event.target.value)}
                {...fieldProps('name')}
                className={cn(INPUT_CLASS, fieldErrors.name && FIELD_INVALID_CLASS)}
              />
              <FieldFeedback id={fieldErrorId('name')}>{fieldErrors.name}</FieldFeedback>
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

            <RoleSelectorField staffRole={role} onSelect={edit(setRole)} />
          </CardContent>
        </Card>

        <FormActionPane
          submitLabel={isSubmitting ? commonT('loading') : commonT('save')}
          cancelLabel={commonT('cancel')}
          cancelHref="/dashboard/team"
          desktopSaveTestId="staff-detail-save-desktop"
          mobileSaveTestId="staff-detail-save-mobile"
          isSubmitting={isSubmitting}
          feedback={feedback.feedback}
        />
      </div>
    </form>
  );
}
