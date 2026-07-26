'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { getPublicEnv } from '@/shared/lib/runtime-env/public-env';
import { HotsiteAuthBarDropdown } from './HotsiteAuthBarDropdown';

interface HotsiteAuthBarProps {
  readonly slug: string;
}

interface StaffSession {
  readonly name: string;
}

interface CustomerSession {
  readonly name: string;
}

// Client-side, after hydration — not SSR. Reading cookies() during the
// [slug] page's server render forces Next.js to treat the whole route as
// dynamic per-request, silently disabling the ISR/CDN cache the hotsite
// depends on (docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md §6). /api/staff/me and
// /api/customers/me already exist as same-origin proxy routes that forward
// the httpOnly cookie server-side to the BFF; a 401 here just means "not
// logged in as this role" — not an error — since staff/customer roles are
// mutually exclusive by construction (BFF's @Roles guard rejects the other).
async function fetchStaffSession(slug: string): Promise<StaffSession | null> {
  const res = await fetch(`/api/staff/me?slug=${encodeURIComponent(slug)}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { name: string | null };
  return { name: data.name ?? '' };
}

async function fetchCustomerSession(slug: string): Promise<CustomerSession | null> {
  const res = await fetch(`/api/customers/me?slug=${encodeURIComponent(slug)}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { name: string };
  return { name: data.name };
}

export function HotsiteAuthBar({ slug }: HotsiteAuthBarProps): React.JSX.Element {
  const t = useTranslations('auth');
  const [staff, setStaff] = useState<StaffSession | null>(null);
  const [customer, setCustomer] = useState<CustomerSession | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchStaffSession(slug)
      .then((session) => {
        if (!cancelled) setStaff(session);
      })
      .catch(() => {
        if (!cancelled) setStaff(null);
      });

    fetchCustomerSession(slug)
      .then((session) => {
        if (!cancelled) setCustomer(session);
      })
      .catch(() => {
        if (!cancelled) setCustomer(null);
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const isStaff = staff !== null;
  const isCustomer = !isStaff && customer !== null;
  const displayName = staff?.name || customer?.name || '';

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
            href={`${getPublicEnv('NEXT_PUBLIC_BFF_URL')}/auth/logout?tenantSlug=${slug}`}
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
