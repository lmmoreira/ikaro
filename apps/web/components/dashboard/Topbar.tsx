'use client';

import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { usePathname } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatTodayLabel } from '@/lib/utils/format-today';
import { getInitials } from '@/lib/utils/initials';
import { BOOKING_STATUS_CLASSES, buildBookingStatusLabels } from './bookings/booking-status';
import { useDashboardTopbarStatus } from './topbar-status-context';

interface TopbarProps {
  readonly tenantName: string;
  readonly userName: string | null;
}

const PAGE_TITLE_KEYS: ReadonlyArray<[string, string]> = [
  ['/dashboard/bookings', 'nav.bookings'],
  ['/dashboard/schedule', 'nav.schedule'],
  ['/dashboard/services', 'nav.services'],
  ['/dashboard/loyalty', 'nav.loyalty'],
  ['/dashboard/team', 'nav.team'],
  ['/dashboard/settings', 'nav.settings'],
  ['/dashboard/hotsite', 'nav.hotsite'],
];

export function Topbar({ tenantName, userName }: TopbarProps): React.JSX.Element {
  const commonT = useTranslations('common');
  const t = useTranslations('dashboard');
  const bookingT = useTranslations('dashboard.bookingDetail');
  const locale = useLocale();
  const pathname = usePathname();
  const topbarStatus = useDashboardTopbarStatus();
  const initials = getInitials(userName);
  const bookingRouteMatch = pathname.match(
    /^\/dashboard\/bookings\/([^/]+)(?:\/(complete|reschedule))?$/,
  );
  const isBookingRoute = Boolean(bookingRouteMatch);
  const pageTitleKey = PAGE_TITLE_KEYS.find(([path]) => pathname.startsWith(path))?.[1];
  const pageTitle = bookingRouteMatch?.[2]
    ? bookingRouteMatch[2] === 'complete'
      ? bookingT('completeSheetTitle')
      : bookingT('rescheduleSheetTitle')
    : bookingRouteMatch
      ? bookingT('title')
      : pageTitleKey
        ? t(pageTitleKey)
        : t('topbar.defaultTitle');
  const bookingStatusLabels = buildBookingStatusLabels(bookingT);
  const backHref = bookingRouteMatch?.[2]
    ? `/dashboard/bookings/${bookingRouteMatch[1]}`
    : '/dashboard/bookings';
  const showBookingBackLink = Boolean(bookingRouteMatch);

  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-100 bg-white px-4 py-3 lg:px-6">
      {showBookingBackLink ? (
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={backHref}
            className="flex items-center gap-1.5 text-[0.9375rem] font-semibold text-gray-900 transition-colors hover:text-blue-700"
          >
            <ChevronLeft className="h-5 w-5" />
            <span>{commonT('back')}</span>
          </Link>
          <h1 className="truncate text-[1.0625rem] font-bold text-gray-900">{pageTitle}</h1>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2.5 lg:hidden">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-600 text-[0.8125rem] font-bold text-white">
              {tenantName[0]?.toUpperCase() ?? 'I'}
            </div>
            <span className="truncate text-[0.9375rem] font-bold text-gray-900">{tenantName}</span>
          </div>

          <h1 className="hidden text-[1.0625rem] font-bold text-gray-900 lg:block">{pageTitle}</h1>
        </>
      )}

      <div className="ml-auto flex items-center gap-3">
        {topbarStatus?.bookingStatus && isBookingRoute && (
          <Badge
            className={cn(
              'shrink-0 rounded-full border-0 px-3.5 py-2 text-[0.875rem] font-semibold',
              BOOKING_STATUS_CLASSES[topbarStatus.bookingStatus] ?? 'bg-gray-100 text-gray-600',
            )}
          >
            {bookingStatusLabels[topbarStatus.bookingStatus]}
          </Badge>
        )}

        {/* suppressHydrationWarning: date may differ between server TZ and client TZ at midnight */}
        <span
          suppressHydrationWarning
          className="hidden text-[0.8125rem] text-gray-900/50 lg:inline"
        >
          {formatTodayLabel(locale, t('topbar.todayPrefix'))}
        </span>

        {/* Mobile: user avatar (initials) */}
        <Avatar className="h-8 w-8 lg:hidden">
          <AvatarFallback className="bg-blue-600 text-xs font-bold text-white">
            {initials}
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
