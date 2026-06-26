'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Home, Calendar, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CustomerBottomNavProps {
  readonly tenantSlug: string;
}

export function CustomerBottomNav({ tenantSlug }: CustomerBottomNavProps): React.JSX.Element {
  const t = useTranslations('customer');
  const pathname = usePathname();
  const homeHref = `/${tenantSlug}/my-account`;

  const navItems = [
    { href: homeHref, labelKey: 'nav.home', Icon: Home },
    { href: `/${tenantSlug}/my-account/bookings`, labelKey: 'nav.bookings', Icon: Calendar },
    { href: `/${tenantSlug}/my-account/loyalty`, labelKey: 'nav.loyalty', Icon: Star },
  ] as const;

  function isActive(href: string): boolean {
    if (href === homeHref) return pathname === homeHref;
    return pathname.startsWith(href);
  }

  const itemClass = (active: boolean) =>
    cn(
      'flex flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[0.625rem] font-semibold tracking-[0.02em] transition-colors',
      active ? 'text-blue-600' : 'text-gray-900/40',
    );

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 flex border-t border-gray-100 bg-white lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}
      aria-label="customer-bottom-nav"
    >
      {navItems.map(({ href, labelKey, Icon }) => (
        <Link key={href} href={href} className={itemClass(isActive(href))}>
          <Icon className="h-[1.375rem] w-[1.375rem] shrink-0" aria-hidden="true" />
          {t(labelKey)}
        </Link>
      ))}
    </nav>
  );
}
