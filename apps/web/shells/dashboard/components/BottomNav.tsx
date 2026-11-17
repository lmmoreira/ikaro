'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { FeatureKey } from '@ikaro/types';
import { MoreHorizontal } from 'lucide-react';
import { isRouteLocked } from '@/shared/lib/billing/feature-registry';
import { cn } from '@/shared/utils/cn';
import type { DashboardNav } from '@/shells/dashboard/model/dashboard-nav';
import { NavLockMark } from './NavLockMark';
import {
  isBookingCreateRoute,
  matchBookingDetailRoute,
} from '@/shells/dashboard/model/booking-route';
import {
  isRecurringScheduleCreateRoute,
  matchRecurringScheduleRoute,
} from '@/shells/dashboard/model/recurring-schedule-route';
import { isResourceCreateRoute, matchResourceRoute } from '@/shells/dashboard/model/resource-route';
import { matchSchedulingExceptionRescheduleRoute } from '@/shells/dashboard/model/scheduling-exception-route';
import { isServiceCreateRoute, matchServiceRoute } from '@/shells/dashboard/model/service-route';
import { isTeamInviteRoute, matchTeamRoute } from '@/shells/dashboard/model/team-route';

interface BottomNavProps {
  // What the dashboard shell resolved for this caller (`resolveDashboardNav`): the tabs, and whether
  // the "Mais" button exists.
  readonly nav: DashboardNav;
  // The features the tenant does not hold: a drill-down route of one keeps the bar (see below).
  readonly lockedFeatures: readonly FeatureKey[];
  readonly onOpenSheet: () => void;
}

export function BottomNav({
  nav,
  lockedFeatures,
  onOpenSheet,
}: BottomNavProps): React.JSX.Element | null {
  const t = useTranslations('dashboard');
  const pathname = usePathname();
  const isBookingDetail = matchBookingDetailRoute(pathname) !== null;
  const isRecurringScheduleDetail =
    matchRecurringScheduleRoute(pathname) !== null || isRecurringScheduleCreateRoute(pathname);
  const isServiceDetailAction = matchServiceRoute(pathname) !== null;
  const isLoyaltyDetail = /^\/dashboard\/loyalty\/[^/]+$/.test(pathname);
  const isTeamDetailRoute = matchTeamRoute(pathname) !== null;
  const isResourceDetailRoute = matchResourceRoute(pathname) !== null;
  const isSchedulingExceptionReschedule =
    matchSchedulingExceptionRescheduleRoute(pathname) !== null;

  // A locked route renders the locked page instead of the drill-down page, so no back arrow
  // exists there and the tabs are the only way out on mobile.
  const routeLocked = isRouteLocked(pathname, lockedFeatures);

  // /dashboard/settings and /dashboard/hotsite are deliberately NOT in this list (unlike the
  // drill-down routes above) — they're top-level sections with no topbar back arrow, so hiding
  // BottomNav there leaves mobile users with zero way to reach any other section. Both pages'
  // own mobile action bars are offset above BottomNav instead (see their own `bottom-[calc(...)]`
  // class) so the two don't overlap.
  if (
    !routeLocked &&
    (isBookingDetail ||
      isRecurringScheduleDetail ||
      isBookingCreateRoute(pathname) ||
      isServiceDetailAction ||
      isServiceCreateRoute(pathname) ||
      isLoyaltyDetail ||
      isTeamInviteRoute(pathname) ||
      isTeamDetailRoute ||
      isResourceCreateRoute(pathname) ||
      isResourceDetailRoute ||
      isSchedulingExceptionReschedule)
  )
    return null;

  // A locked tab keeps the label colour of any inactive tab: dimming the whole link would stack on
  // the already muted label and fall below readable contrast. The padlock and the dimmed icon carry
  // the locked cue.
  const itemClass = (active: boolean) =>
    cn(
      'relative flex flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[0.625rem] font-semibold tracking-[0.02em] transition-colors',
      active ? 'text-blue-600' : 'text-gray-900/40',
    );

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 flex border-t bg-white lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}
    >
      {nav.bottomTabs.map(({ href, labelKey, Icon, locked }) => {
        const isActive = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            data-locked={locked ? 'true' : undefined}
            className={itemClass(isActive)}
          >
            <Icon className={cn('h-[1.375rem] w-[1.375rem] shrink-0', locked && 'opacity-60')} />
            {t(labelKey)}
            {locked ? <NavLockMark className="absolute right-3 top-1" /> : null}
          </Link>
        );
      })}

      {/* The sheet holds the manager's items and a toggled module such as Leads (also when shown
          locked), so the button exists exactly when the sheet has an item for this caller. */}
      {nav.hasSheet && (
        <button
          type="button"
          onClick={onOpenSheet}
          className={itemClass(false)}
          aria-label={t('nav.moreOptions')}
        >
          <MoreHorizontal className="h-[1.375rem] w-[1.375rem] shrink-0" />
          {t('nav.more')}
        </button>
      )}
    </nav>
  );
}
