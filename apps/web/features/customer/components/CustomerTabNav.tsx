'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/utils/cn';
import { getCustomerNavItems, getNavIconClass, isCustomerNavActive } from './customer-nav-items';

interface CustomerTabNavProps {
  readonly tenantSlug: string;
}

export function CustomerTabNav({ tenantSlug }: CustomerTabNavProps): React.JSX.Element {
  const t = useTranslations('customer');
  const pathname = usePathname();
  const navItems = getCustomerNavItems(tenantSlug);
  const homeHref = navItems[0].href;

  const linkClass = (active: boolean) =>
    cn(
      'group flex items-center gap-1.5 border-b-2 px-4 py-3 text-sm font-medium transition-colors',
      active ? 'border-blue-600' : 'border-transparent',
    );
  const labelClass = (active: boolean) =>
    cn(active ? 'text-blue-600' : 'text-gray-900/40 group-hover:text-gray-900/70');

  return (
    <nav
      className="sticky top-[3.375rem] z-[5] hidden border-b border-gray-100 bg-white px-6 lg:flex"
      aria-label="customer-tabs"
    >
      {navItems.map(({ href, labelKey, Icon, iconColorClass }) => {
        const active = isCustomerNavActive(pathname, href, homeHref);
        return (
          <Link key={href} href={href} className={linkClass(active)}>
            <Icon
              className={getNavIconClass('h-4 w-4', iconColorClass, active)}
              aria-hidden="true"
            />
            <span className={labelClass(active)}>{t(labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
