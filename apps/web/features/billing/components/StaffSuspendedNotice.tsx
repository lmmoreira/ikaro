'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/shared/components/ui/button';
import { getPublicEnv } from '@/shared/lib/runtime-env/public-env';

interface StaffSuspendedNoticeProps {
  readonly tenantSlug: string;
}

// What a staff member of a suspended tenant sees (UC-121): the account is suspended and the only
// next step is to talk to the manager, who is the one who can fix it. The only action is signing
// out; no reason and no payment information is ever shown to staff. The manager's own notice is
// `ManagerSuspendedNotice` (M25-S29).
export function StaffSuspendedNotice({ tenantSlug }: StaffSuspendedNoticeProps): React.JSX.Element {
  const t = useTranslations('dashboard.billing.suspended.staff');
  const logoutUrl = `${getPublicEnv('NEXT_PUBLIC_BFF_URL')}/auth/logout?tenantSlug=${tenantSlug}`;

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-6 py-16 text-center"
      data-testid="staff-suspended-notice"
    >
      <div className="w-full max-w-sm">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-xl bg-indigo-600 text-xl font-bold text-white">
          I
        </div>
        <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
        <p className="mt-3 text-sm leading-relaxed text-gray-600">{t('body')}</p>
        <Button asChild variant="outline" className="mt-8 w-full">
          <a href={logoutUrl} data-testid="staff-suspended-sign-out">
            {t('signOut')}
          </a>
        </Button>
      </div>
    </main>
  );
}
