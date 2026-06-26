'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type React from 'react';
import type { TenantOption } from '@ikaro/types';
import { fetchCustomerTenants, switchTenant } from '@/lib/api/auth';
import { ErrorAlert } from '../booking/ErrorAlert';

interface SwitchTenantClientProps {
  readonly currentTenantSlug: string | null;
}

type FetchState = 'loading' | 'loaded' | 'error';

function TenantAvatar({
  name,
  size = 'md',
}: {
  readonly name: string;
  readonly size?: 'sm' | 'md';
}): React.JSX.Element {
  const dimension = size === 'sm' ? 'h-8 w-8 text-sm' : 'h-10 w-10 text-base';
  return (
    <div
      className={`flex shrink-0 items-center justify-center font-bold text-white ${dimension}`}
      style={{ backgroundColor: 'var(--ba-primary)', borderRadius: 'var(--ba-radius)' }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function ChevronIcon(): React.JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 opacity-40"
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function SwitchTenantClient({
  currentTenantSlug,
}: SwitchTenantClientProps): React.JSX.Element {
  const t = useTranslations('auth');
  const router = useRouter();
  const [fetchState, setFetchState] = useState<FetchState>('loading');
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState(false);

  useEffect(() => {
    let active = true;
    fetchCustomerTenants()
      .then((data) => {
        if (!active) return;
        setTenants(data);
        setFetchState('loaded');
      })
      .catch(() => {
        if (!active) return;
        setFetchState('error');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (fetchState === 'loaded' && tenants.length <= 1 && currentTenantSlug) {
      router.replace(`/${currentTenantSlug}`);
    }
  }, [fetchState, tenants, currentTenantSlug, router]);

  async function handleSelect(targetTenantId: string): Promise<void> {
    setSwitchingId(targetTenantId);
    setSwitchError(false);
    try {
      const result = await switchTenant(targetTenantId);
      router.push(`/${result.tenantSlug}`);
    } catch {
      setSwitchingId(null);
      setSwitchError(true);
    }
  }

  const currentTenant = tenants.find((tenant) => tenant.slug === currentTenantSlug);

  return (
    <main
      className="flex min-h-screen items-center justify-center px-6 py-16"
      style={{ backgroundColor: 'var(--ba-background)' }}
    >
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          {currentTenant && (
            <div className="mb-3 flex flex-col items-center gap-2">
              <TenantAvatar name={currentTenant.name} size="sm" />
              <p className="text-sm font-bold" style={{ color: 'var(--ba-text)' }}>
                {currentTenant.name}
              </p>
            </div>
          )}
          <h1
            data-testid="switch-tenant-heading"
            className="text-xl font-bold"
            style={{ color: 'var(--ba-text)' }}
          >
            {t('switchTenantHeading')}
          </h1>
          <p className="mt-1.5 text-sm opacity-60" style={{ color: 'var(--ba-text)' }}>
            {t('switchTenantSubtitle')}
          </p>
        </div>

        {fetchState === 'loading' && (
          <div className="flex flex-col gap-3" data-testid="switch-tenant-loading">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="h-[4.5rem] animate-pulse"
                style={{ backgroundColor: 'var(--ba-secondary)', borderRadius: 'var(--ba-radius)' }}
              />
            ))}
          </div>
        )}

        {fetchState === 'error' && (
          <div data-testid="switch-tenant-fetch-error">
            <ErrorAlert onRetry={() => router.refresh()} retryLabel={t('selectTenantRetry')}>
              {t('selectTenantError')}
            </ErrorAlert>
          </div>
        )}

        {fetchState === 'loaded' && (
          <div className="flex flex-col gap-3" data-testid="switch-tenant-list">
            {tenants.map((tenant) => {
              const isCurrent = tenant.slug === currentTenantSlug;
              return isCurrent ? (
                <div
                  key={tenant.id}
                  data-testid="switch-tenant-current"
                  className="flex items-center gap-4 border-2 px-5 py-4 opacity-70"
                  style={{
                    borderColor: 'var(--ba-primary)',
                    backgroundColor: 'var(--ba-secondary)',
                    borderRadius: 'var(--ba-radius)',
                    boxShadow: 'var(--ba-shadow)',
                  }}
                >
                  <TenantAvatar name={tenant.name} />
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-[0.9375rem] font-semibold"
                      style={{ color: 'var(--ba-text)' }}
                    >
                      {tenant.name}
                    </p>
                    <p className="text-[0.8125rem] opacity-60" style={{ color: 'var(--ba-text)' }}>
                      {t('tenantLoyaltyPoints', { count: tenant.loyaltyPoints })}
                    </p>
                  </div>
                  <span
                    className="shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[0.6875rem] font-bold"
                    style={{ backgroundColor: 'var(--ba-primary)', color: 'var(--ba-btn-text)' }}
                  >
                    {t('switchTenantCurrentBadge')}
                  </span>
                </div>
              ) : (
                <button
                  key={tenant.id}
                  type="button"
                  data-testid="switch-tenant-option"
                  disabled={switchingId !== null}
                  onClick={() => handleSelect(tenant.id)}
                  className="flex cursor-pointer items-center gap-4 px-5 py-4 text-left transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
                  style={{
                    backgroundColor: 'var(--ba-secondary)',
                    borderRadius: 'var(--ba-radius)',
                    boxShadow: 'var(--ba-shadow)',
                  }}
                >
                  <TenantAvatar name={tenant.name} />
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-[0.9375rem] font-semibold"
                      style={{ color: 'var(--ba-text)' }}
                    >
                      {tenant.name}
                    </p>
                    <p className="text-[0.8125rem] opacity-60" style={{ color: 'var(--ba-text)' }}>
                      {t('tenantLoyaltyPoints', { count: tenant.loyaltyPoints })}
                    </p>
                  </div>
                  <ChevronIcon />
                </button>
              );
            })}
          </div>
        )}

        {switchError && (
          <div className="mt-4" data-testid="switch-tenant-error">
            <ErrorAlert>{t('switchTenantError')}</ErrorAlert>
          </div>
        )}

        <p className="mt-7 text-center">
          <button
            type="button"
            data-testid="switch-tenant-cancel"
            onClick={() => {
              // A hard navigation, not router.back()/router.push(): the hotsite was reached via
              // a plain <a href> from HotsiteAuthBar (not a Next.js <Link>), so "back" can be
              // served from the browser's own back-forward cache — a frozen JS snapshot that
              // may never re-run HotsiteAuthBar's on-mount auth check, leaving the customer's
              // name missing even though they're still logged in. We already know exactly where
              // to land (the tenant they're already authenticated against), so go there directly
              // instead of relying on history.
              if (currentTenantSlug) {
                globalThis.location.href = `/${currentTenantSlug}`;
              } else {
                router.back();
              }
            }}
            className="text-sm font-medium"
            style={{ color: 'var(--ba-primary)' }}
          >
            {t('switchTenantBack')}
          </button>
        </p>
      </div>
    </main>
  );
}
