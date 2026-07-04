'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/utils/cn';
import {
  getCustomerNavItems,
  isCustomerNavActive,
  shouldShowCustomerBottomNav,
} from './customer-nav-items';

interface CustomerBottomNavProps {
  readonly tenantSlug: string;
}

export function CustomerBottomNav({
  tenantSlug,
}: CustomerBottomNavProps): React.JSX.Element | null {
  const t = useTranslations('customer');
  const pathname = usePathname();
  const navItems = getCustomerNavItems(tenantSlug);
  const homeHref = navItems[0].href;

  if (!shouldShowCustomerBottomNav(pathname)) return null;

  const linkClass =
    'flex flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[0.625rem] font-semibold tracking-[0.02em] transition-opacity';
  const labelClass = (active: boolean) => (active ? 'text-blue-600' : 'text-gray-900/40');

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 flex border-t border-gray-100 bg-white lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}
      aria-label="customer-bottom-nav"
    >
      {navItems.map(({ href, labelKey, Icon, iconColorClass }) => {
        const active = isCustomerNavActive(pathname, href, homeHref);
        return (
          <Link key={href} href={href} className={linkClass}>
            <Icon
              className={cn(
                'h-[1.375rem] w-[1.375rem] shrink-0',
                iconColorClass,
                active ? 'opacity-100' : 'opacity-60',
              )}
              aria-hidden="true"
            />
            <span className={labelClass(active)}>{t(labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
