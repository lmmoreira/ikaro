'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Calendar, Clock, Wrench, Star, MoreHorizontal } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import { matchBookingDetailRoute } from '@/shells/dashboard/model/booking-route';
import { isServiceCreateRoute, matchServiceRoute } from '@/shells/dashboard/model/service-route';
import { isTeamInviteRoute, matchTeamRoute } from '@/shells/dashboard/model/team-route';

interface BottomNavProps {
  readonly role: 'STAFF' | 'MANAGER';
  readonly onOpenSheet: () => void;
}

const NAV_ITEM_KEYS = [
  { href: '/dashboard/bookings', labelKey: 'nav.bookings', Icon: Calendar },
  { href: '/dashboard/schedule', labelKey: 'nav.schedule', Icon: Clock },
  { href: '/dashboard/services', labelKey: 'nav.services', Icon: Wrench },
  { href: '/dashboard/loyalty', labelKey: 'nav.loyalty', Icon: Star },
] as const;

export function BottomNav({ role, onOpenSheet }: BottomNavProps): React.JSX.Element | null {
  const t = useTranslations('dashboard');
  const pathname = usePathname();
  const isBookingDetail = matchBookingDetailRoute(pathname) !== null;
  const isServiceDetailAction = matchServiceRoute(pathname) !== null;
  const isLoyaltyDetail = /^\/dashboard\/loyalty\/[^/]+$/.test(pathname);
  const isTeamDetailRoute = matchTeamRoute(pathname) !== null;

  // /dashboard/settings and /dashboard/hotsite are deliberately NOT in this list (unlike the
  // drill-down routes above) — they're top-level sections with no topbar back arrow, so hiding
  // BottomNav there leaves mobile users with zero way to reach any other section. Both pages'
  // own mobile action bars are offset above BottomNav instead (see their own `bottom-[calc(...)]`
  // class) so the two don't overlap.
  if (
    isBookingDetail ||
    isServiceDetailAction ||
    isServiceCreateRoute(pathname) ||
    isLoyaltyDetail ||
    isTeamInviteRoute(pathname) ||
    isTeamDetailRoute
  )
    return null;

  const itemClass = (active: boolean) =>
    cn(
      'flex flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[0.625rem] font-semibold tracking-[0.02em] transition-colors',
      active ? 'text-blue-600' : 'text-gray-900/40',
    );

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 flex border-t bg-white lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}
    >
      {NAV_ITEM_KEYS.map(({ href, labelKey, Icon }) => {
        const isActive = pathname.startsWith(href);
        return (
          <Link key={href} href={href} className={itemClass(isActive)}>
            <Icon className="h-[1.375rem] w-[1.375rem] shrink-0" />
            {t(labelKey)}
          </Link>
        );
      })}

      {role === 'MANAGER' && (
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
