import { Home, Calendar, Star } from 'lucide-react';
import type { CustomerFeatureKey } from '@ikaro/types';
import { cn } from '@/shared/utils/cn';

export interface CustomerNavItem {
  readonly href: string;
  readonly labelKey: 'nav.home' | 'nav.bookings' | 'nav.loyalty';
  readonly Icon: typeof Home;
  readonly iconColorClass: string;
  /** The feature a tenant must hold for this tab to be offered; absent for Início. */
  readonly feature?: CustomerFeatureKey;
}

// Fixed per-tab accent — always visible, independent of active/inactive state (only opacity
// changes for that). Matches the always-colorful look of the prototype's emoji nav (🏠📅⭐).
// `entitledFeatures` is `null` when the tenant's features are unknown (a failed read): every tab
// stays, so a hiccup never hides one.
export function getCustomerNavItems(
  tenantSlug: string,
  entitledFeatures: readonly CustomerFeatureKey[] | null = null,
): readonly CustomerNavItem[] {
  const homeHref = `/${tenantSlug}/my-account`;
  const items: readonly CustomerNavItem[] = [
    { href: homeHref, labelKey: 'nav.home', Icon: Home, iconColorClass: 'text-blue-600' },
    {
      href: `/${tenantSlug}/my-account/bookings`,
      labelKey: 'nav.bookings',
      Icon: Calendar,
      iconColorClass: 'text-blue-600',
      feature: 'BOOKING',
    },
    {
      href: `/${tenantSlug}/my-account/loyalty`,
      labelKey: 'nav.loyalty',
      Icon: Star,
      iconColorClass: 'text-amber-500',
      feature: 'LOYALTY',
    },
  ];
  return items.filter(
    ({ feature }) =>
      feature === undefined || entitledFeatures === null || entitledFeatures.includes(feature),
  );
}

// Shared by CustomerTabNav and CustomerBottomNav — the icon's opacity/color rule is identical
// across both nav variants; only the icon's size class differs between desktop and mobile.
export function getNavIconClass(
  sizeClass: string,
  iconColorClass: string,
  active: boolean,
): string {
  return cn(sizeClass, 'shrink-0', iconColorClass, active ? 'opacity-100' : 'opacity-60');
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
