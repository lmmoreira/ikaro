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

interface CtaConfig {
  readonly ctaLabel: string;
  readonly ctaHref: string;
}

function makeErrorConfig(heading: string, message: string, cta: CtaConfig): ErrorConfig {
  return { heading, message, ...cta };
}

export default async function AuthErrorPage({ searchParams }: Props) {
  const { reason } = await searchParams;
  const t = await getTranslations('auth');

  const ctaLogin: CtaConfig = { ctaLabel: t('errorBackToLogin'), ctaHref: '/dashboard/login' };
  const ctaSite: CtaConfig = { ctaLabel: t('errorBackToSite'), ctaHref: '/' };

  const ERROR_MAP: Record<string, ErrorConfig> = {
    'not-a-staff-member': makeErrorConfig(
      t('errorNotAStaffMemberHeading'),
      t('errorNotAStaffMemberMessage'),
      ctaLogin,
    ),
    'staff-deactivated': makeErrorConfig(
      t('errorStaffDeactivatedHeading'),
      t('errorStaffDeactivatedMessage'),
      ctaLogin,
    ),
    'email-mismatch': makeErrorConfig(
      t('errorEmailMismatchHeading'),
      t('errorEmailMismatchMessage'),
      ctaLogin,
    ),
    'invite-not-found': makeErrorConfig(
      t('errorInviteNotFoundHeading'),
      t('errorInviteNotFoundMessage'),
      ctaLogin,
    ),
    'tenant-not-found': makeErrorConfig(
      t('errorTenantNotFoundHeading'),
      t('errorTenantNotFoundMessage'),
      ctaSite,
    ),
    'tenant-deactivated': makeErrorConfig(
      t('errorTenantDeactivatedHeading'),
      t('errorTenantDeactivatedMessage'),
      ctaSite,
    ),
    'no-tenant': makeErrorConfig(t('errorNoTenantHeading'), t('errorNoTenantMessage'), ctaSite),
  };

  const config = (reason && ERROR_MAP[reason]) || {
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
