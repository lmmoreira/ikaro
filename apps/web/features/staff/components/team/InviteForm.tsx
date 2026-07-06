'use client';

import { useEffect, useState, type SubmitEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { StaffRole } from '@ikaro/types';
import { ApiError } from '@/shared/lib/api/errors';
import { useInviteStaff } from '@/features/staff/hooks/useStaff';
import { validateInviteForm, type InviteFormErrors } from '@/features/staff/invite-form';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { cn } from '@/shared/utils/cn';
import { useDashboardTopbarStatus } from '@/shells/dashboard/components/topbar-status-context';

interface InviteFormProps {
  readonly initialEmail?: string;
}

const INPUT_CLASS =
  'w-full rounded-md border border-border bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50';

interface RoleOptionProps {
  readonly staffRole: StaffRole;
  readonly selected: boolean;
  readonly title: string;
  readonly description: string;
  readonly onSelect: (staffRole: StaffRole) => void;
}

function RoleOption({
  staffRole,
  selected,
  title,
  description,
  onSelect,
}: RoleOptionProps): React.JSX.Element {
  return (
    <button
      type="button"
      data-testid="invite-role-option"
      data-role={staffRole}
      aria-pressed={selected}
      onClick={() => onSelect(staffRole)}
      className={cn(
        'rounded-md border px-3.5 py-3.5 text-left transition-colors',
        selected
          ? 'border-2 border-blue-600 bg-blue-50'
          : 'border-border bg-white hover:bg-slate-50',
      )}
    >
      <span className="block text-sm font-bold text-gray-900">{title}</span>
      <span className="mt-0.5 block text-sm text-gray-500">{description}</span>
    </button>
  );
}

export function InviteForm({ initialEmail = '' }: InviteFormProps): React.JSX.Element {
  const t = useTranslations('dashboard.teamPage');
  const commonT = useTranslations('common');
  const router = useRouter();
  const inviteStaffMutation = useInviteStaff();
  const topbarStatus = useDashboardTopbarStatus();
  const setStaffRoleStatus = topbarStatus?.setStaffRoleStatus;
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState(initialEmail);
  const [role, setRole] = useState<StaffRole>('STAFF');
  const [fieldErrors, setFieldErrors] = useState<InviteFormErrors>({});
  const [isSubmittingLocal, setIsSubmittingLocal] = useState(false);

  const isSubmitting = isSubmittingLocal || inviteStaffMutation.isPending;

  useEffect(() => {
    setStaffRoleStatus?.(role);
  }, [role, setStaffRoleStatus]);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const validation = validateInviteForm({ firstName, lastName, email, role }, t);
    setFieldErrors(validation.errors);
    if (!validation.normalized) return;

    setIsSubmittingLocal(true);
    try {
      await inviteStaffMutation.mutateAsync(validation.normalized);
      router.push(`/dashboard/team?invited=${encodeURIComponent(validation.normalized.email)}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setFieldErrors({ email: t('inviteDuplicateEmail') });
        return;
      }

      setFieldErrors({ submit: t('inviteFailed') });
    } finally {
      setIsSubmittingLocal(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pb-28 lg:space-y-6 lg:pb-0">
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
                  onChange={(event) => setFirstName(event.target.value)}
                  placeholder={t('firstNamePlaceholder')}
                  aria-invalid={Boolean(fieldErrors.firstName)}
                  aria-describedby={fieldErrors.firstName ? 'invite-first-name-error' : undefined}
                  className={INPUT_CLASS}
                />
                {fieldErrors.firstName && (
                  <p
                    id="invite-first-name-error"
                    data-testid="invite-first-name-error"
                    className="mt-1.5 text-sm text-red-600"
                  >
                    {fieldErrors.firstName}
                  </p>
                )}
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
                  onChange={(event) => setLastName(event.target.value)}
                  placeholder={t('lastNamePlaceholder')}
                  aria-invalid={Boolean(fieldErrors.lastName)}
                  aria-describedby={fieldErrors.lastName ? 'invite-last-name-error' : undefined}
                  className={INPUT_CLASS}
                />
                {fieldErrors.lastName && (
                  <p
                    id="invite-last-name-error"
                    data-testid="invite-last-name-error"
                    className="mt-1.5 text-sm text-red-600"
                  >
                    {fieldErrors.lastName}
                  </p>
                )}
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
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t('emailPlaceholder')}
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? 'invite-email-error' : 'invite-email-hint'}
                className={INPUT_CLASS}
              />
              {fieldErrors.email ? (
                <p
                  id="invite-email-error"
                  data-testid="invite-email-error"
                  className="mt-1.5 text-sm text-red-600"
                >
                  {fieldErrors.email}
                </p>
              ) : (
                <p id="invite-email-hint" className="mt-1.5 text-sm text-gray-500">
                  {t('emailHint')}
                </p>
              )}
            </div>

            <fieldset>
              <legend className="mb-1.5 block text-sm font-semibold text-gray-900">
                {t('roleLabel')}
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <RoleOption
                  staffRole="STAFF"
                  selected={role === 'STAFF'}
                  title={t('roleStaff')}
                  description={t('roleStaffDesc')}
                  onSelect={setRole}
                />
                <RoleOption
                  staffRole="MANAGER"
                  selected={role === 'MANAGER'}
                  title={t('roleManager')}
                  description={t('roleManagerDesc')}
                  onSelect={setRole}
                />
              </div>
            </fieldset>

            {fieldErrors.submit && (
              <div
                data-testid="invite-submit-error"
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
                data-testid="invite-submit-desktop"
                className="w-full"
                disabled={isSubmitting}
              >
                {isSubmitting ? commonT('loading') : t('inviteSubmit')}
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link href="/dashboard/team">{commonT('cancel')}</Link>
              </Button>
              <hr className="border-t border-gray-200" />
              <p className="text-sm leading-6 text-gray-500">{t('inviteAsideHint')}</p>
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
            data-testid="invite-submit-mobile"
            className="w-full"
            disabled={isSubmitting}
          >
            {isSubmitting ? commonT('loading') : t('inviteSubmit')}
          </Button>
        </div>
      </div>
    </form>
  );
}
