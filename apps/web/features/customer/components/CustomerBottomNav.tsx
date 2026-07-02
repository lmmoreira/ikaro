'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/utils/cn';
import { getCustomerNavItems, isCustomerNavActive } from './customer-nav-items';

interface CustomerBottomNavProps {
  readonly tenantSlug: string;
}

export function CustomerBottomNav({ tenantSlug }: CustomerBottomNavProps): React.JSX.Element {
  const t = useTranslations('customer');
  const pathname = usePathname();
  const navItems = getCustomerNavItems(tenantSlug);
  const homeHref = navItems[0].href;

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
        <Link
          key={href}
          href={href}
          className={itemClass(isCustomerNavActive(pathname, href, homeHref))}
        >
          <Icon className="h-[1.375rem] w-[1.375rem] shrink-0" aria-hidden="true" />
          {t(labelKey)}
        </Link>
      ))}
    </nav>
  );
}
