'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import type { SessionResponse } from '@ikaro/types';
import { getPublicEnv } from '@/shared/lib/runtime-env/public-env';
import { HotsiteAuthBarDropdown } from './HotsiteAuthBarDropdown';

interface HotsiteAuthBarProps {
  readonly slug: string;
  readonly logoUrl: string;
  readonly tenantName: string;
}

// Brand mark, left-most element — see plan/journey/shared/hotsite.html's topbar section for the
// validated size/placement (28px circle, ahead of the staff-area link). Falls back to an
// initial-letter badge when no logo is uploaded yet, same pattern as app/[slug]/login/page.tsx.
function BrandMark({
  logoUrl,
  tenantName,
}: {
  readonly logoUrl: string;
  readonly tenantName: string;
}): React.JSX.Element {
  return logoUrl ? (
    <Image
      src={logoUrl}
      alt={tenantName}
      width={28}
      height={28}
      className="h-7 w-7 flex-shrink-0 rounded-full object-cover"
    />
  ) : (
    <div
      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold"
      style={{ backgroundColor: 'var(--ba-primary)', color: 'var(--ba-btn-text)' }}
    >
      {tenantName.charAt(0).toUpperCase()}
    </div>
  );
}

// Client-side, after hydration — not SSR. Reading cookies() during the [slug] page's server
// render forces Next.js to treat the whole route as dynamic per-request, silently disabling the
// ISR/CDN cache the hotsite depends on (docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md §6).
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

  if (session === null) {
    return (
      <header
        className="flex h-12 items-center justify-between px-6"
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
        <div
          className="h-3.5 w-16 animate-pulse rounded"
          style={{ backgroundColor: 'var(--ba-text)', opacity: 0.15 }}
        />
      </header>
    );
  }

  const isStaff = session.staff !== null;
  const isCustomer = !isStaff && session.customer !== null;
  const displayName = session.staff?.name || session.customer?.name || '';

  return (
    <header
      className="flex h-12 items-center justify-between px-6"
      style={{ backgroundColor: 'var(--ba-secondary)' }}
      data-testid="hotsite-auth-bar"
    >
      <div className="flex items-center gap-3">
        <BrandMark logoUrl={logoUrl} tenantName={tenantName} />
        {isStaff ? (
          <div
            className="flex items-center gap-3 border-l pl-3"
            style={{ borderColor: 'rgba(17,24,39,0.12)' }}
          >
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
            className="flex items-center gap-1.5 border-l pl-3 text-[0.8125rem] font-medium no-underline opacity-40"
            style={{ color: 'var(--ba-text)', borderColor: 'rgba(17,24,39,0.12)' }}
          >
            {BriefcaseIcon}
            {t('staffArea')}
          </a>
        )}
      </div>
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
