'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { FeatureKey } from '@ikaro/types';
import { Calendar, Clock, Wrench, Star, MoreHorizontal } from 'lucide-react';
import { isRouteLocked } from '@/shared/lib/billing/feature-registry';
import { cn } from '@/shared/utils/cn';
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
  readonly role: 'STAFF' | 'MANAGER';
  readonly leadFormEnabled: boolean;
  readonly lockedFeatures: readonly FeatureKey[];
  readonly onOpenSheet: () => void;
}

const NAV_ITEM_KEYS = [
  { href: '/dashboard/bookings', labelKey: 'nav.bookings', Icon: Calendar },
  { href: '/dashboard/schedule', labelKey: 'nav.schedule', Icon: Clock },
  { href: '/dashboard/services', labelKey: 'nav.services', Icon: Wrench },
  { href: '/dashboard/loyalty', labelKey: 'nav.loyalty', Icon: Star },
] as const;

export function BottomNav({
  role,
  leadFormEnabled,
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

  // /dashboard/settings and /dashboard/hotsite are deliberately NOT in this list (unlike the
  // drill-down routes above) — they're top-level sections with no topbar back arrow, so hiding
  // BottomNav there leaves mobile users with zero way to reach any other section. Both pages'
  // own mobile action bars are offset above BottomNav instead (see their own `bottom-[calc(...)]`
  // class) so the two don't overlap.
  if (
    isBookingDetail ||
    isRecurringScheduleDetail ||
    isBookingCreateRoute(pathname) ||
    isServiceDetailAction ||
    isServiceCreateRoute(pathname) ||
    isLoyaltyDetail ||
    isTeamInviteRoute(pathname) ||
    isTeamDetailRoute ||
    isResourceCreateRoute(pathname) ||
    isResourceDetailRoute ||
    isSchedulingExceptionReschedule
  )
    return null;

  const itemClass = (active: boolean, locked = false) =>
    cn(
      'relative flex flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[0.625rem] font-semibold tracking-[0.02em] transition-colors',
      active ? 'text-blue-600' : 'text-gray-900/40',
      locked && 'opacity-60',
    );
  // The "Mais" sheet holds Leads, so a tenant whose Leads item is shown locked still opens it.
  const leadsVisible = leadFormEnabled || lockedFeatures.includes('LEAD_FORM');

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 flex border-t bg-white lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}
    >
      {NAV_ITEM_KEYS.map(({ href, labelKey, Icon }) => {
        const isActive = pathname.startsWith(href);
        const locked = isRouteLocked(href, lockedFeatures);
        return (
          <Link
            key={href}
            href={href}
            data-locked={locked ? 'true' : undefined}
            className={itemClass(isActive, locked)}
          >
            <Icon className="h-[1.375rem] w-[1.375rem] shrink-0" />
            {t(labelKey)}
            {locked ? <NavLockMark className="absolute right-3 top-1" /> : null}
          </Link>
        );
      })}

      {(role === 'MANAGER' || (role === 'STAFF' && leadsVisible)) && (
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
