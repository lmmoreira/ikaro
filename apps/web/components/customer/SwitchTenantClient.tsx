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

function TenantAvatar({ name }: { readonly name: string }): React.JSX.Element {
  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center text-base font-bold text-white"
      style={{ backgroundColor: 'var(--ba-primary)', borderRadius: 'var(--ba-radius)' }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
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

  return (
    <main
      className="flex min-h-screen items-center justify-center px-6 py-16"
      style={{ backgroundColor: 'var(--ba-background)' }}
    >
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-bold" style={{ color: 'var(--ba-text)' }}>
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
                  className="flex items-center gap-4 border-2 px-5 py-4 text-left transition-colors disabled:opacity-60"
                  style={{
                    borderColor: 'var(--ba-secondary)',
                    backgroundColor: 'var(--ba-background)',
                    borderRadius: 'var(--ba-radius)',
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
            onClick={() => router.back()}
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
