'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/shared/components/ui/button';
import { getPublicEnv } from '@/shared/lib/runtime-env/public-env';

interface ManagerSuspendedNoticeProps {
  readonly tenantSlug: string;
}

// What a manager of a suspended tenant sees (UC-121): the account is suspended and the next step is
// the billing area. The manager is the one who can fix it, so the copy never says "talk to the
// manager" (that sentence is the staff notice's, M25-S31a). In M25 this is only the notice: M26
// repoints the redirect, and this call to action, to the billing page. Never a reason is shown.
export function ManagerSuspendedNotice({
  tenantSlug,
}: ManagerSuspendedNoticeProps): React.JSX.Element {
  const t = useTranslations('dashboard.billing.suspended.manager');
  const logoutUrl = `${getPublicEnv('NEXT_PUBLIC_BFF_URL')}/auth/logout?tenantSlug=${tenantSlug}`;

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-6 py-16 text-center"
      data-testid="manager-suspended-notice"
    >
      <div className="w-full max-w-sm">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-xl bg-indigo-600 text-xl font-bold text-white">
          I
        </div>
        <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
        <p className="mt-3 text-sm leading-relaxed text-gray-600">{t('body')}</p>
        <p className="mt-3 text-sm leading-relaxed text-gray-600">{t('billingHint')}</p>
        <Button asChild variant="outline" className="mt-8 w-full">
          <a href={logoutUrl} data-testid="manager-suspended-sign-out">
            {t('signOut')}
          </a>
        </Button>
      </div>
    </main>
  );
}
