'use client';

import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { usePathname } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/shared/components/ui/avatar';
import { Badge } from '@/shared/components/ui/badge';
import { cn } from '@/shared/utils/cn';
import { formatTodayLabel } from '@/shells/dashboard/utils/format-today';
import { getInitials } from '@/shared/utils/initials';
import { matchServiceRoute } from '@/shells/dashboard/model/service-route';
import { matchTeamRoute } from '@/shells/dashboard/model/team-route';
import { resolveTopbarRouteState } from '@/shells/dashboard/model/topbar-route';
import {
  BOOKING_STATUS_CLASSES,
  buildBookingStatusLabels,
} from '@/features/booking/model/booking-status';
import { useDashboardTopbarStatus } from './topbar-status-context';

interface TopbarProps {
  readonly tenantName: string;
  readonly userName: string | null;
  readonly action?: React.ReactNode;
}

export function Topbar({ tenantName, userName, action }: TopbarProps): React.JSX.Element {
  const commonT = useTranslations('common');
  const t = useTranslations('dashboard');
  const servicesT = useTranslations('dashboard.servicesPage');
  const teamT = useTranslations('dashboard.teamPage');
  const bookingT = useTranslations('dashboard.bookingDetail');
  const locale = useLocale();
  const pathname = usePathname();
  const topbarStatus = useDashboardTopbarStatus();
  const initials = getInitials(userName);
  const serviceRouteMatch = matchServiceRoute(pathname);
  const teamRouteMatch = matchTeamRoute(pathname);
  const returnTo = topbarStatus?.backHrefOverride ?? null;
  const backLabelOverride = topbarStatus?.backLabelOverride ?? null;
  const pageTitleOverride = topbarStatus?.pageTitleOverride ?? null;
  const onBackOverride = topbarStatus?.onBackOverride ?? null;
  const {
    pageTitle,
    backHref,
    backLabel,
    isBookingRoute,
    isServicesCreateRoute,
    isTeamInviteRoute,
  } = resolveTopbarRouteState({
    pathname,
    commonBackLabel: commonT('back'),
    dashboardT: t,
    servicesT,
    teamT,
    bookingT,
    returnTo,
  });
  const bookingStatusLabels = buildBookingStatusLabels(bookingT);
  const showBackLink = Boolean(backHref) || Boolean(onBackOverride);
  const effectivePageTitle = pageTitleOverride ?? pageTitle;
  const effectiveBackLabel = backLabelOverride ?? backLabel;
  const backLinkClassName =
    'flex items-center gap-1.5 text-[0.9375rem] font-semibold text-gray-900 transition-colors hover:text-blue-700';

  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-100 bg-white px-4 py-3 lg:px-6">
      {showBackLink ? (
        <div className="flex min-w-0 items-center gap-3">
          {onBackOverride ? (
            <button
              type="button"
              data-testid="topbar-back-button"
              onClick={onBackOverride}
              className={backLinkClassName}
            >
              <ChevronLeft className="h-5 w-5" />
              <span>{effectiveBackLabel}</span>
            </button>
          ) : (
            <Link href={backHref!} className={backLinkClassName}>
              <ChevronLeft className="h-5 w-5" />
              <span>{effectiveBackLabel}</span>
            </Link>
          )}
          <h1 className="truncate text-[1.0625rem] font-bold text-gray-900">
            {effectivePageTitle}
          </h1>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2.5 lg:hidden">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-600 text-[0.8125rem] font-bold text-white">
              {tenantName[0]?.toUpperCase() ?? 'I'}
            </div>
            <span className="truncate text-[0.9375rem] font-bold text-gray-900">{tenantName}</span>
          </div>

          <h1 className="hidden text-[1.0625rem] font-bold text-gray-900 lg:block">
            {effectivePageTitle}
          </h1>
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
        {topbarStatus?.staffRoleStatus &&
          (isTeamInviteRoute || teamRouteMatch?.action === 'edit') && (
            <Badge
              data-testid="team-role-badge"
              className="shrink-0 rounded-full border-0 bg-slate-100 px-3.5 py-2 text-[0.875rem] font-semibold text-slate-600"
            >
              {topbarStatus.staffRoleStatus === 'MANAGER'
                ? teamT('roleManager')
                : teamT('roleStaff')}
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
