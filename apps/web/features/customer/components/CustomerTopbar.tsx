'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronLeft } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/shared/components/ui/avatar';
import { Badge } from '@/shared/components/ui/badge';
import { fetchCustomerTenants } from '@/features/auth/api';
import { getInitials } from '@/shared/utils/initials';
import {
  buildBookingStatusLabels,
  BOOKING_STATUS_CLASSES,
} from '@/features/booking/model/booking-status';
import { cn } from '@/shared/utils/cn';
import { useCustomerTopbarStatus } from './customer-topbar-status-context';

interface CustomerTopbarProps {
  readonly tenantName: string;
  readonly tenantSlug: string;
  readonly userName: string | null;
}

export function CustomerTopbar({
  tenantName,
  tenantSlug,
  userName,
}: CustomerTopbarProps): React.JSX.Element {
  const t = useTranslations('customer');
  const statusLabelsT = useTranslations('customer.bookingItem');
  const initials = getInitials(userName);
  const logoutUrl = `${process.env.NEXT_PUBLIC_BFF_URL}/auth/logout?tenantSlug=${tenantSlug}`;
  const [hasMultipleTenants, setHasMultipleTenants] = useState(false);
  const topbarStatus = useCustomerTopbarStatus();
  const statusLabels = buildBookingStatusLabels(statusLabelsT);

  useEffect(() => {
    fetchCustomerTenants()
      .then((tenants) => setHasMultipleTenants(tenants.length > 1))
      .catch(() => {});
  }, []);

  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-100 bg-white px-4 py-3 lg:px-6">
      {topbarStatus?.backHrefOverride ? (
        <Link
          href={topbarStatus.backHrefOverride}
          className="flex min-w-0 items-center gap-1.5 text-[0.9375rem] font-semibold text-gray-900 transition-colors hover:text-blue-700"
        >
          <ChevronLeft className="h-5 w-5 shrink-0" />
          <span className="truncate">{topbarStatus.backLabelOverride}</span>
        </Link>
      ) : (
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-600 text-[0.8125rem] font-bold text-white"
            aria-hidden="true"
          >
            {tenantName[0]?.toUpperCase() ?? 'I'}
          </div>
          <span className="truncate text-[0.9375rem] font-bold text-gray-900">{tenantName}</span>
        </div>
      )}

      <div className="ml-auto flex items-center gap-3">
        {topbarStatus?.bookingStatus && (
          <Badge
            data-testid="topbar-booking-status-badge"
            className={cn(
              'shrink-0 rounded-full border-0 px-3.5 py-2 text-[0.875rem] font-semibold',
              BOOKING_STATUS_CLASSES[topbarStatus.bookingStatus] ?? 'bg-gray-100 text-gray-600',
            )}
          >
            {statusLabels[topbarStatus.bookingStatus]}
          </Badge>
        )}

        <Link
          href={`/${tenantSlug}/booking`}
          className="hidden items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-[0.8125rem] font-semibold text-white transition-colors hover:bg-blue-700 lg:flex"
        >
          + {t('topbar.newBooking')}
        </Link>

        <details className="relative" data-testid="avatar-dropdown">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarFallback className="bg-blue-600 text-xs font-bold text-white">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span
              className="hidden font-semibold text-gray-900 lg:inline"
              data-testid="topbar-user-name"
            >
              {userName ?? ''}
            </span>
            <ChevronDown className="h-3 w-3 shrink-0 text-gray-900/40" />
          </summary>

          <div className="absolute right-0 top-full z-50 mt-2 min-w-48 overflow-hidden rounded-lg border border-gray-100 bg-white shadow-lg">
            <Link
              href={`/${tenantSlug}`}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-900/65 hover:bg-gray-50"
            >
              ← {t('topbar.backToSite', { tenantName })}
            </Link>
            {hasMultipleTenants && (
              <Link
                href="/switch-tenant"
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-900/65 hover:bg-gray-50"
                data-testid="switch-tenant-link"
              >
                {t('topbar.switchTenant')}
              </Link>
            )}
            <hr className="border-gray-100" />
            <a
              href={logoutUrl}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-gray-50"
            >
              {t('topbar.signOut')}
            </a>
          </div>
        </details>
      </div>
    </header>
  );
}
