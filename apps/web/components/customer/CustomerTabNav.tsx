'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { getCustomerNavItems, isCustomerNavActive } from './customer-nav-items';

interface CustomerTabNavProps {
  readonly tenantSlug: string;
}

export function CustomerTabNav({ tenantSlug }: CustomerTabNavProps): React.JSX.Element {
  const t = useTranslations('customer');
  const pathname = usePathname();
  const navItems = getCustomerNavItems(tenantSlug);
  const homeHref = navItems[0].href;

  const itemClass = (active: boolean) =>
    cn(
      'flex items-center gap-1.5 border-b-2 px-4 py-3 text-sm font-medium transition-colors',
      active
        ? 'border-blue-600 text-blue-600'
        : 'border-transparent text-gray-900/40 hover:text-gray-900/70',
    );

  return (
    <nav
      className="sticky top-[3.375rem] z-[5] hidden border-b border-gray-100 bg-white px-6 lg:flex"
      aria-label="customer-tabs"
    >
      {navItems.map(({ href, labelKey, Icon }) => (
        <Link
          key={href}
          href={href}
          className={itemClass(isCustomerNavActive(pathname, href, homeHref))}
        >
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t(labelKey)}
        </Link>
      ))}
    </nav>
  );
}
