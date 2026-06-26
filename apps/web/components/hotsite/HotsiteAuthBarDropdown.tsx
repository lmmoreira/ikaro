'use client';

import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { fetchCustomerTenants } from '@/lib/api/auth';
import { getInitials } from '@/lib/utils/initials';

interface HotsiteAuthBarDropdownProps {
  readonly name: string;
  readonly slug: string;
}

export function HotsiteAuthBarDropdown({
  name,
  slug,
}: HotsiteAuthBarDropdownProps): React.JSX.Element {
  const t = useTranslations('auth');
  const [hasMultipleTenants, setHasMultipleTenants] = useState(false);

  useEffect(() => {
    fetchCustomerTenants()
      .then((tenants) => setHasMultipleTenants(tenants.length >= 2))
      .catch(() => {
        // "Trocar empresa" stays hidden if the tenant count can't be determined.
      });
  }, []);

  return (
    <details className="relative">
      <summary
        className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden"
        style={{ color: 'var(--ba-text)' }}
      >
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold"
          style={{ backgroundColor: 'var(--ba-primary)', color: 'var(--ba-btn-text)' }}
        >
          {getInitials(name)}
        </span>
        <span className="flex flex-col items-start leading-tight">
          <span>{name || t('myAccount')}</span>
          <span
            className="text-[0.6875rem] font-normal opacity-50"
            data-testid="hotsite-auth-tenant-slug"
          >
            {slug}
          </span>
        </span>
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
          data-testid="hotsite-customer-logout-link"
          className="block px-4 py-2.5 text-sm opacity-60"
          style={{ color: 'var(--ba-text)' }}
        >
          {t('signOut')}
        </a>
      </div>
    </details>
  );
}
