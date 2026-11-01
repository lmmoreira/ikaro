'use client';

import { useEffect, useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { StaffErrorCode, type StaffRole } from '@ikaro/types';
import { useInviteStaff } from '@/features/staff/hooks/useStaff';
import { validateInviteForm } from '@/features/staff/invite-form';
import { Card, CardContent } from '@/shared/components/ui/card';
import { FIELD_INVALID_CLASS, FieldFeedback } from '@/shared/components/ui/field-feedback';
import { FormActionPane } from '@/shared/components/ui/form-action-pane';
import { useDashboardTopbarStatus } from '@/shells/dashboard/components/topbar-status-context';
import { RoleSelectorField } from '@/features/staff/components/team/RoleSelectorField';
import { useFormFeedback } from '@/shared/lib/feedback/use-form-feedback';
import { extractProblemCode, resolveErrorMessage } from '@/shared/lib/i18n/resolve-error-message';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { cn } from '@/shared/utils/cn';

const INPUT_CLASS =
  'w-full rounded-md border border-border bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

export function InviteForm(): React.JSX.Element {
  const t = useTranslations('dashboard.teamPage');
  const commonT = useTranslations('common');
  const locale = useResolvedLocale();
  const router = useRouter();
  const inviteStaffMutation = useInviteStaff();
  const topbarStatus = useDashboardTopbarStatus();
  const setStaffRoleStatus = topbarStatus?.setStaffRoleStatus;
  const feedback = useFormFeedback();
  const { fieldProps, fieldErrors, fieldErrorId, clear: clearFeedback } = feedback;
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('STAFF');
  const [isSubmittingLocal, setIsSubmittingLocal] = useState(false);

  const isSubmitting = isSubmittingLocal || inviteStaffMutation.isPending;

  useEffect(() => {
    setStaffRoleStatus?.(role);
  }, [role, setStaffRoleStatus]);

  // An edit removes the previous error, as the other migrated forms do.
  function edit<T>(setter: (value: T) => void): (value: T) => void {
    return (value) => {
      clearFeedback();
      setter(value);
    };
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    clearFeedback();

    const validation = validateInviteForm({ firstName, lastName, email, role }, t);
    if (!validation.normalized) {
      feedback.setFieldErrors(validation.errors);
      return;
    }

    setIsSubmittingLocal(true);
    try {
      await inviteStaffMutation.mutateAsync(validation.normalized);
      router.push(`/dashboard/team?invited=${encodeURIComponent(validation.normalized.email)}`);
    } catch (err) {
      // The backend sends no `field` for an existing e-mail, so the code decides which input
      // carries it; every other failure is the form-level message under the buttons.
      const code = extractProblemCode(err);
      if (code === StaffErrorCode.ALREADY_EXISTS) {
        feedback.setFieldErrors({ email: resolveErrorMessage(code, locale) });
      } else {
        feedback.setFromApiError(err, locale);
      }
    } finally {
      setIsSubmittingLocal(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4 pb-28 lg:space-y-6 lg:pb-0">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <Card>
          <CardContent className="space-y-5 p-5 lg:p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="invite-first-name"
                  className="mb-1.5 block text-sm font-semibold text-gray-900"
                >
                  {t('firstNameLabel')}
                </label>
                <input
                  id="invite-first-name"
                  data-testid="invite-first-name-input"
                  type="text"
                  value={firstName}
                  onChange={(event) => edit(setFirstName)(event.target.value)}
                  placeholder={t('firstNamePlaceholder')}
                  {...fieldProps('firstName')}
                  className={cn(INPUT_CLASS, fieldErrors.firstName && FIELD_INVALID_CLASS)}
                />
                <FieldFeedback id={fieldErrorId('firstName')}>
                  {fieldErrors.firstName}
                </FieldFeedback>
              </div>
              <div>
                <label
                  htmlFor="invite-last-name"
                  className="mb-1.5 block text-sm font-semibold text-gray-900"
                >
                  {t('lastNameLabel')}
                </label>
                <input
                  id="invite-last-name"
                  data-testid="invite-last-name-input"
                  type="text"
                  value={lastName}
                  onChange={(event) => edit(setLastName)(event.target.value)}
                  placeholder={t('lastNamePlaceholder')}
                  {...fieldProps('lastName')}
                  className={cn(INPUT_CLASS, fieldErrors.lastName && FIELD_INVALID_CLASS)}
                />
                <FieldFeedback id={fieldErrorId('lastName')}>{fieldErrors.lastName}</FieldFeedback>
              </div>
            </div>

            <div>
              <label
                htmlFor="invite-email"
                className="mb-1.5 block text-sm font-semibold text-gray-900"
              >
                {t('emailLabel')}
              </label>
              <input
                id="invite-email"
                data-testid="invite-email-input"
                type="email"
                value={email}
                onChange={(event) => edit(setEmail)(event.target.value)}
                placeholder={t('emailPlaceholder')}
                {...fieldProps('email')}
                className={cn(INPUT_CLASS, fieldErrors.email && FIELD_INVALID_CLASS)}
              />
              {fieldErrors.email ? (
                <FieldFeedback id={fieldErrorId('email')}>{fieldErrors.email}</FieldFeedback>
              ) : (
                <p className="mt-1.5 text-sm text-gray-500">{t('emailHint')}</p>
              )}
            </div>

            <RoleSelectorField staffRole={role} onSelect={edit(setRole)} />
          </CardContent>
        </Card>

        <FormActionPane
          submitLabel={isSubmitting ? commonT('loading') : t('inviteSubmit')}
          cancelLabel={commonT('cancel')}
          cancelHref="/dashboard/team"
          desktopSaveTestId="invite-submit-desktop"
          mobileSaveTestId="invite-submit-mobile"
          isSubmitting={isSubmitting}
          feedback={feedback.feedback}
          hint={t('inviteAsideHint')}
        />
      </div>
    </form>
  );
}
