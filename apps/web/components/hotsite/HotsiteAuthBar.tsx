'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { getHotsiteCustomerProfile } from '@/lib/api/customers';
import { fetchCustomerTenants } from '@/lib/api/auth';

interface HotsiteAuthBarProps {
  readonly slug: string;
}

type AuthBarState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'authenticated'; name: string };

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}

export function HotsiteAuthBar({ slug }: HotsiteAuthBarProps): React.JSX.Element {
  const t = useTranslations('auth');
  const [state, setState] = useState<AuthBarState>({ status: 'loading' });
  const [hasMultipleTenants, setHasMultipleTenants] = useState(false);

  useEffect(() => {
    let active = true;
    getHotsiteCustomerProfile().then((profile) => {
      if (!active) return;
      setState(
        profile ? { status: 'authenticated', name: profile.name } : { status: 'unauthenticated' },
      );
      if (profile) {
        fetchCustomerTenants()
          .then((tenants) => {
            if (active) setHasMultipleTenants(tenants.length >= 2);
          })
          .catch(() => {
            // "Trocar empresa" simply stays hidden if the tenant count can't be determined.
          });
      }
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <header
      className="flex h-12 items-center justify-between px-6"
      style={{ backgroundColor: 'var(--ba-secondary)' }}
      data-testid="hotsite-auth-bar"
    >
      <a
        href="/dashboard/login"
        data-testid="hotsite-staff-link"
        className="flex items-center gap-1.5 text-[0.8125rem] font-medium no-underline opacity-40"
        style={{ color: 'var(--ba-text)' }}
      >
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
        {t('staffArea')}
      </a>
      {state.status === 'authenticated' && (
        <details className="relative">
          <summary
            className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden"
            style={{ color: 'var(--ba-text)' }}
          >
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold"
              style={{ backgroundColor: 'var(--ba-primary)', color: 'var(--ba-btn-text)' }}
            >
              {getInitials(state.name)}
            </span>
            <span>{state.name}</span>
            <ChevronDown size={14} />
          </summary>
          <div
            className="absolute right-0 top-full z-50 mt-2 min-w-44 overflow-hidden border shadow-lg"
            style={{
              backgroundColor: 'var(--ba-secondary)',
              borderColor: 'var(--ba-background)',
              borderRadius: 'var(--ba-radius)',
            }}
          >
            <a
              href={`/${slug}/my-account`}
              className="block px-4 py-2.5 text-sm font-medium"
              style={{ color: 'var(--ba-text)' }}
            >
              {t('myAccount')}
            </a>
            {hasMultipleTenants && (
              <a
                href="/switch-tenant"
                data-testid="hotsite-switch-tenant-link"
                className="block px-4 py-2.5 text-sm font-medium"
                style={{ color: 'var(--ba-text)' }}
              >
                {t('switchTenant')}
              </a>
            )}
            <hr style={{ borderColor: 'var(--ba-background)' }} />
            <a
              href={`${process.env.NEXT_PUBLIC_BFF_URL}/auth/logout?tenantSlug=${slug}`}
              className="block px-4 py-2.5 text-sm opacity-60"
              style={{ color: 'var(--ba-text)' }}
            >
              {t('signOut')}
            </a>
          </div>
        </details>
      )}
      {state.status === 'unauthenticated' && (
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
