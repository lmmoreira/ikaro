import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { decodeJwtPayload } from '@/features/auth/decode-jwt';
import { unixNow } from '@/shells/hotsite/utils/unix-now';
import { HotsiteAuthBarDropdown } from './HotsiteAuthBarDropdown';

interface HotsiteAuthBarProps {
  readonly slug: string;
}

export async function HotsiteAuthBar({ slug }: HotsiteAuthBarProps): Promise<React.JSX.Element> {
  const t = await getTranslations('auth');

  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value;
  const payload = token ? decodeJwtPayload(token) : {};

  const nowSeconds = unixNow();
  const isExpired = payload.exp !== undefined && nowSeconds > payload.exp;
  const isTenantMatch = payload.tenantSlug === slug;
  const isValidSession = !isExpired && isTenantMatch && !!payload.role && !!payload.sub;

  const isStaff = isValidSession && (payload.role === 'STAFF' || payload.role === 'MANAGER');
  const isCustomer = isValidSession && payload.role === 'CUSTOMER';
  const displayName = payload.userName ?? '';

  const BriefcaseIcon = (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );

  return (
    <header
      className="flex h-12 items-center justify-between px-6"
      style={{ backgroundColor: 'var(--ba-secondary)' }}
      data-testid="hotsite-auth-bar"
    >
      {isStaff ? (
        <div className="flex items-center gap-3">
          <a
            href="/dashboard"
            data-testid="hotsite-staff-authenticated-link"
            className="flex items-center gap-1.5 text-[0.8125rem] font-medium no-underline"
            style={{ color: 'var(--ba-text)' }}
          >
            {BriefcaseIcon}
            {displayName || t('staffArea')}
          </a>
          <a
            href={`${process.env.NEXT_PUBLIC_BFF_URL}/auth/logout?tenantSlug=${slug}`}
            data-testid="hotsite-staff-logout-link"
            className="text-[0.8125rem] font-medium no-underline opacity-60"
            style={{ color: 'var(--ba-text)' }}
          >
            {t('signOut')}
          </a>
        </div>
      ) : (
        <a
          href={`/dashboard/login?tenantSlug=${encodeURIComponent(slug)}`}
          data-testid="hotsite-staff-link"
          className="flex items-center gap-1.5 text-[0.8125rem] font-medium no-underline opacity-40"
          style={{ color: 'var(--ba-text)' }}
        >
          {BriefcaseIcon}
          {t('staffArea')}
        </a>
      )}
      {isCustomer ? (
        <HotsiteAuthBarDropdown name={displayName} slug={slug} />
      ) : (
        <a
          href={`/${slug}/login`}
          data-testid="hotsite-login-link"
          className="text-sm font-medium"
          style={{ color: 'var(--ba-primary)' }}
        >
          {t('signIn')}
        </a>
      )}
    </header>
  );
}
