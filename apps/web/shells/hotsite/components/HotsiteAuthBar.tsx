'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { HotsiteNavigationItem, NavigationModuleData, SessionResponse } from '@ikaro/types';
import { getPublicEnv } from '@/shared/lib/runtime-env/public-env';
import { HotsiteAuthBarDropdown } from './HotsiteAuthBarDropdown';
import { HotsiteNavigation } from './HotsiteNavigation';
import {
  BrandMark,
  BriefcaseIcon,
  HotsiteAuthBarSignedOut,
  StaffAreaLink,
} from './HotsiteAuthBarSignedOut';

interface HotsiteAuthBarProps {
  readonly slug: string;
  readonly logoUrl: string;
  readonly tenantName: string;
  // The NAVIGATION module's resolved links (resolveHotsiteNavigation); none renders nothing.
  readonly navigation?: readonly HotsiteNavigationItem[];
  readonly navigationCta?: NavigationModuleData['cta'];
}

// Client-side, after hydration — not SSR. Reading cookies() during the [slug] page's server
// render forces Next.js to treat the whole route as dynamic per-request, silently disabling the
// ISR/CDN cache the hotsite depends on (docs/HOTSITE_DYNAMIC_ARCHITECTURE.md §6).
// /api/session is a thin same-origin proxy to the BFF's GET /auth/session, which does the actual
// staff-vs-customer branching (BFF orchestration, not web) — staff/customer roles are mutually
// exclusive by construction, so at most one of the two is ever non-null for a real session.
async function fetchSession(slug: string): Promise<SessionResponse> {
  const res = await fetch(`/api/session?slug=${encodeURIComponent(slug)}`);
  if (!res.ok) return { staff: null, customer: null };
  return (await res.json()) as SessionResponse;
}

export function HotsiteAuthBar({
  slug,
  logoUrl,
  tenantName,
  navigation = [],
  navigationCta,
}: HotsiteAuthBarProps): React.JSX.Element {
  const t = useTranslations('auth');
  // null (distinct from { staff: null, customer: null }) means "the fetch hasn't resolved yet" —
  // rendering a skeleton for that state instead of the unauthenticated markup avoids a flash of
  // "logged out" content for authenticated visitors while /api/session is in flight.
  const [session, setSession] = useState<SessionResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchSession(slug)
      .then((result) => {
        if (!cancelled) setSession(result);
      })
      .catch(() => {
        if (!cancelled) setSession({ staff: null, customer: null });
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (session === null) {
    return (
      <header
        className="relative flex h-12 items-center justify-between px-6"
        style={{ backgroundColor: 'var(--ba-secondary)' }}
        data-testid="hotsite-auth-bar"
      >
        <div className="flex items-center gap-3">
          <BrandMark logoUrl={logoUrl} tenantName={tenantName} />
          <div
            data-testid="hotsite-auth-bar-skeleton"
            className="h-3.5 w-24 animate-pulse rounded"
            style={{ backgroundColor: 'var(--ba-text)', opacity: 0.15 }}
          />
        </div>
        <HotsiteNavigation items={navigation} slug={slug} cta={navigationCta} />
        <div
          className="h-3.5 w-16 animate-pulse rounded"
          style={{ backgroundColor: 'var(--ba-text)', opacity: 0.15 }}
        />
      </header>
    );
  }

  const isStaff = session.staff !== null;
  const isCustomer = !isStaff && session.customer !== null;
  if (!isStaff && !isCustomer) {
    return (
      <HotsiteAuthBarSignedOut
        slug={slug}
        logoUrl={logoUrl}
        tenantName={tenantName}
        navigation={navigation}
        navigationCta={navigationCta}
      />
    );
  }
  const displayName = session.staff?.name || session.customer?.name || '';

  return (
    <header
      className="relative flex h-12 items-center justify-between px-6"
      style={{ backgroundColor: 'var(--ba-secondary)' }}
      data-testid="hotsite-auth-bar"
    >
      <div className="flex items-center gap-3">
        <BrandMark logoUrl={logoUrl} tenantName={tenantName} />
        {isStaff ? (
          <div
            className="flex items-center gap-3 border-l pl-3"
            style={{ borderColor: 'var(--ba-secondary-divider, rgba(17,24,39,0.12))' }}
          >
            <Link
              href="/dashboard"
              data-testid="hotsite-staff-authenticated-link"
              className="flex items-center gap-1.5 text-[0.8125rem] font-medium no-underline"
              style={{ color: 'var(--ba-secondary-text, var(--ba-text))' }}
            >
              <BriefcaseIcon />
              {displayName || t('staffArea')}
            </Link>
            <a
              href={`${getPublicEnv('NEXT_PUBLIC_BFF_URL')}/auth/logout?tenantSlug=${slug}`}
              data-testid="hotsite-staff-logout-link"
              className="text-[0.8125rem] font-medium no-underline opacity-60"
              style={{ color: 'var(--ba-secondary-text, var(--ba-text))' }}
            >
              {t('signOut')}
            </a>
          </div>
        ) : (
          <StaffAreaLink slug={slug} />
        )}
      </div>
      <HotsiteNavigation items={navigation} slug={slug} cta={navigationCta} />
      {isCustomer ? (
        <HotsiteAuthBarDropdown name={displayName} slug={slug} />
      ) : (
        <a
          href={`/${slug}/login`}
          data-testid="hotsite-login-link"
          className="text-sm font-medium"
          style={{ color: 'var(--ba-secondary-accent, var(--ba-primary))' }}
        >
          {t('signIn')}
        </a>
      )}
    </header>
  );
}
