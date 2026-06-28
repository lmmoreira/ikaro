'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Calendar, Clock, Wrench, Star, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  const isBookingDetail = /^\/dashboard\/bookings\/[^/]+$/.test(pathname);

  if (isBookingDetail) return null;

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
