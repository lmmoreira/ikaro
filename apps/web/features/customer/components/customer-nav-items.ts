import { Home, Calendar, Star } from 'lucide-react';

// Fixed per-tab accent — always visible, independent of active/inactive state (only opacity
// changes for that). Matches the always-colorful look of the prototype's emoji nav (🏠📅⭐).
export function getCustomerNavItems(tenantSlug: string) {
  const homeHref = `/${tenantSlug}/my-account`;
  return [
    { href: homeHref, labelKey: 'nav.home' as const, Icon: Home, iconColorClass: 'text-blue-600' },
    {
      href: `/${tenantSlug}/my-account/bookings`,
      labelKey: 'nav.bookings' as const,
      Icon: Calendar,
      iconColorClass: 'text-blue-600',
    },
    {
      href: `/${tenantSlug}/my-account/loyalty`,
      labelKey: 'nav.loyalty' as const,
      Icon: Star,
      iconColorClass: 'text-amber-500',
    },
  ];
}

export function isCustomerNavActive(pathname: string, href: string, homeHref: string): boolean {
  if (href === homeHref) return pathname === homeHref;
  return pathname.startsWith(href);
}

// The three tab routes only — /{slug}/my-account, /{slug}/my-account/bookings,
// /{slug}/my-account/loyalty. Anything deeper (booking detail, cancel, cancel/error) is a
// drill-down page and hides the bottom nav, per M13-S28.
const TAB_ROUTE_PATTERN = /^\/[^/]+\/my-account(\/bookings|\/loyalty)?$/;

export function shouldShowCustomerBottomNav(pathname: string): boolean {
  return TAB_ROUTE_PATTERN.test(pathname);
}
