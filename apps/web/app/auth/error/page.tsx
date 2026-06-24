import { getTranslations } from 'next-intl/server';

interface ErrorConfig {
  readonly heading: string;
  readonly message: string;
  readonly ctaLabel: string;
  readonly ctaHref: string;
}

interface Props {
  readonly searchParams: Promise<{ reason?: string }>;
}

export default async function AuthErrorPage({ searchParams }: Props) {
  const { reason } = await searchParams;
  const t = await getTranslations('auth');

  const ERROR_MAP: Record<string, ErrorConfig> = {
    'not-a-staff-member': {
      heading: t('errorNotAStaffMemberHeading'),
      message: t('errorNotAStaffMemberMessage'),
      ctaLabel: t('errorBackToLogin'),
      ctaHref: '/dashboard/login',
    },
    'staff-deactivated': {
      heading: t('errorStaffDeactivatedHeading'),
      message: t('errorStaffDeactivatedMessage'),
      ctaLabel: t('errorBackToLogin'),
      ctaHref: '/dashboard/login',
    },
    'email-mismatch': {
      heading: t('errorEmailMismatchHeading'),
      message: t('errorEmailMismatchMessage'),
      ctaLabel: t('errorBackToLogin'),
      ctaHref: '/dashboard/login',
    },
    'invite-not-found': {
      heading: t('errorInviteNotFoundHeading'),
      message: t('errorInviteNotFoundMessage'),
      ctaLabel: t('errorBackToLogin'),
      ctaHref: '/dashboard/login',
    },
    'tenant-not-found': {
      heading: t('errorTenantNotFoundHeading'),
      message: t('errorTenantNotFoundMessage'),
      ctaLabel: t('errorBackToSite'),
      ctaHref: '/',
    },
    'tenant-deactivated': {
      heading: t('errorTenantDeactivatedHeading'),
      message: t('errorTenantDeactivatedMessage'),
      ctaLabel: t('errorBackToSite'),
      ctaHref: '/',
    },
    'no-tenant': {
      heading: t('errorNoTenantHeading'),
      message: t('errorNoTenantMessage'),
      ctaLabel: t('errorBackToSite'),
      ctaHref: '/',
    },
  };

  const config = (reason && ERROR_MAP[reason]) ?? {
    heading: t('errorFallbackHeading'),
    message: t('errorFallbackMessage'),
    ctaLabel: t('errorBack'),
    ctaHref: 'javascript:history.back()',
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
      <div className="w-full max-w-[26rem] rounded-xl bg-white p-9 text-center shadow-sm">
        <div
          aria-hidden="true"
          className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-red-100"
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#dc2626"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="m15 9-6 6M9 9l6 6" />
          </svg>
        </div>

        <h1 className="mb-2 text-xl font-bold text-gray-900">{config.heading}</h1>
        <p className="mb-7 text-sm leading-relaxed text-gray-500">{config.message}</p>

        <a
          href={config.ctaHref}
          className="inline-block rounded-lg bg-indigo-600 px-6 py-2.5 text-[0.9375rem] font-medium text-white no-underline hover:bg-indigo-700"
        >
          {config.ctaLabel}
        </a>

        {reason && (
          <p className="mt-5 text-xs text-gray-300">
            {t('errorCodeLabel')}: {reason}
          </p>
        )}
      </div>
    </main>
  );
}
