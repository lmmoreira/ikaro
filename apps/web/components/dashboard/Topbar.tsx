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
import { matchBookingDetailRoute } from '@/lib/dashboard/booking-route';
import { matchServiceRoute } from '@/lib/dashboard/service-route';
import { BOOKING_STATUS_CLASSES, buildBookingStatusLabels } from './bookings/booking-status';
import { useDashboardTopbarStatus } from './topbar-status-context';

interface TopbarProps {
  readonly tenantName: string;
  readonly userName: string | null;
  readonly action?: React.ReactNode;
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

interface TopbarRouteState {
  readonly pageTitle: string;
  readonly backHref: string | null;
  readonly backLabel: string;
  readonly isBookingRoute: boolean;
  readonly isServicesCreateRoute: boolean;
}

function resolveTopbarRouteState({
  pathname,
  commonBackLabel,
  dashboardT,
  servicesT,
  bookingT,
}: {
  readonly pathname: string;
  readonly commonBackLabel: string;
  readonly dashboardT: ReturnType<typeof useTranslations>;
  readonly servicesT: ReturnType<typeof useTranslations>;
  readonly bookingT: ReturnType<typeof useTranslations>;
}): TopbarRouteState {
  const bookingRouteMatch = matchBookingDetailRoute(pathname);
  const serviceRouteMatch = matchServiceRoute(pathname);
  const isBookingRoute = bookingRouteMatch !== null;
  const isServicesCreateRoute = pathname === '/dashboard/services/new';
  const pageTitleKey = PAGE_TITLE_KEYS.find(([path]) => pathname.startsWith(path))?.[1];
  let pageTitle = dashboardT('topbar.defaultTitle');
  let backHref: string | null = null;
  let backLabel = commonBackLabel;

  if (bookingRouteMatch) {
    if (bookingRouteMatch.action === 'complete') {
      pageTitle = bookingT('completeSheetTitle');
    } else if (bookingRouteMatch.action === 'reschedule') {
      pageTitle = bookingT('rescheduleSheetTitle');
    } else {
      pageTitle = bookingT('title');
    }

    backHref =
      bookingRouteMatch.action === null
        ? '/dashboard/bookings'
        : `/dashboard/bookings/${bookingRouteMatch.bookingId}`;
    backLabel = commonBackLabel;
  } else if (serviceRouteMatch?.action === 'edit') {
    pageTitle = servicesT('editPageTitle');
    backHref = '/dashboard/services';
    backLabel = dashboardT('nav.services');
  } else if (serviceRouteMatch?.action === 'deactivate') {
    pageTitle = servicesT('deactivatePageTitle');
    backHref = `/dashboard/services/${serviceRouteMatch.serviceId}/edit`;
    backLabel = servicesT('editPageTitle');
  } else if (isServicesCreateRoute) {
    pageTitle = servicesT('createPageTitle');
    backHref = '/dashboard/services';
    backLabel = commonBackLabel;
  } else if (pageTitleKey) {
    pageTitle = dashboardT(pageTitleKey);
  }

  return {
    pageTitle,
    backHref,
    backLabel,
    isBookingRoute,
    isServicesCreateRoute,
  };
}

export function Topbar({ tenantName, userName, action }: TopbarProps): React.JSX.Element {
  const commonT = useTranslations('common');
  const t = useTranslations('dashboard');
  const servicesT = useTranslations('dashboard.servicesPage');
  const bookingT = useTranslations('dashboard.bookingDetail');
  const locale = useLocale();
  const pathname = usePathname();
  const topbarStatus = useDashboardTopbarStatus();
  const initials = getInitials(userName);
  const serviceRouteMatch = matchServiceRoute(pathname);
  const { pageTitle, backHref, backLabel, isBookingRoute, isServicesCreateRoute } =
    resolveTopbarRouteState({
      pathname,
      commonBackLabel: commonT('back'),
      dashboardT: t,
      servicesT,
      bookingT,
    });
  const bookingStatusLabels = buildBookingStatusLabels(bookingT);
  const showBackLink = Boolean(backHref);

  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-100 bg-white px-4 py-3 lg:px-6">
      {showBackLink ? (
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={backHref!}
            className="flex items-center gap-1.5 text-[0.9375rem] font-semibold text-gray-900 transition-colors hover:text-blue-700"
          >
            <ChevronLeft className="h-5 w-5" />
            <span>{backLabel}</span>
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
        {action}
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
        {topbarStatus?.serviceStatus && (serviceRouteMatch || isServicesCreateRoute) && (
          <Badge
            className={cn(
              'shrink-0 rounded-full border-0 px-3.5 py-2 text-[0.875rem] font-semibold',
              topbarStatus.serviceStatus === 'ACTIVE'
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-slate-100 text-slate-600',
            )}
          >
            {topbarStatus.serviceStatus === 'ACTIVE'
              ? servicesT('statusActive')
              : servicesT('statusInactive')}
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
