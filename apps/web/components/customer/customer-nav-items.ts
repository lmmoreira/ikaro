import { Home, Calendar, Star } from 'lucide-react';

export function getCustomerNavItems(tenantSlug: string) {
  const homeHref = `/${tenantSlug}/my-account`;
  return [
    { href: homeHref, labelKey: 'nav.home' as const, Icon: Home },
    {
      href: `/${tenantSlug}/my-account/bookings`,
      labelKey: 'nav.bookings' as const,
      Icon: Calendar,
    },
    { href: `/${tenantSlug}/my-account/loyalty`, labelKey: 'nav.loyalty' as const, Icon: Star },
  ];
}

export function isCustomerNavActive(pathname: string, href: string, homeHref: string): boolean {
  if (href === homeHref) return pathname === homeHref;
  return pathname.startsWith(href);
}
