'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type React from 'react';
import type { TenantOption } from '@ikaro/types';
import { fetchCustomerTenants, switchTenant } from '@/features/auth/api';
import { ErrorAlert } from '@/features/booking/components/public/ErrorAlert';
import { TenantAvatar, TenantOptionRow } from './TenantOptionRow';

interface SwitchTenantClientProps {
  readonly currentTenantSlug: string | null;
}

type FetchState = 'loading' | 'loaded' | 'error';

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
            {tenants.map((tenant) => (
              <TenantOptionRow
                key={tenant.id}
                tenant={tenant}
                isCurrent={tenant.slug === currentTenantSlug}
                disabled={switchingId !== null}
                currentBadgeLabel={t('switchTenantCurrentBadge')}
                loyaltyPointsLabel={t('tenantLoyaltyPoints', { count: tenant.loyaltyPoints })}
                onSelect={() => handleSelect(tenant.id)}
              />
            ))}
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
                // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- hard reload avoids stale authenticated hotsite back-forward cache
                globalThis.location.href = `/${currentTenantSlug}`;
              } else {
                router.back();
              }
            }}
            className="cursor-pointer text-sm font-medium"
            style={{ color: 'var(--ba-primary)' }}
          >
            {t('switchTenantBack')}
          </button>
        </p>
      </div>
    </main>
  );
}
