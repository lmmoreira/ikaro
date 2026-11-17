import {
  Boxes,
  Calendar,
  Clock,
  FileText,
  Globe,
  Settings,
  Star,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { FeatureKey } from '@ikaro/types';
import { isRouteLocked } from '@/shared/lib/billing/feature-registry';

// The one list of the staff dashboard's navigation. The sidebar, the mobile bottom bar and the
// "Mais" sheet are three views of it (each entry says which it appears in), so an item is written
// once and the rule "shown, hidden or locked" is decided once, by `resolveDashboardNav`. A new
// section is one entry here (plus its `ROUTE_FEATURES` row when a feature owns it, the route and the
// label key); no component names an item or a feature.
//
// Not in the list, on purpose: the two `SchedulingExceptions*NavItem` components. They carry their
// own pending-count badge, so the shells still compose them (below "Agenda" in the sidebar, first in
// the sheet's manager section).

export type DashboardNavRole = 'STAFF' | 'MANAGER';

// An optional module the manager switches on, which hides its item while it is off (an item the
// tenant is not entitled to is shown locked instead, whatever the switch says).
type DashboardNavToggle = 'leadForm';
type DashboardNavToggles = Readonly<Record<DashboardNavToggle, boolean>>;

type DashboardNavLabelKey =
  | 'nav.bookings'
  | 'nav.schedule'
  | 'nav.services'
  | 'nav.loyalty'
  | 'nav.leads'
  | 'nav.resources'
  | 'nav.team'
  | 'nav.settings'
  | 'nav.hotsite';

interface DashboardNavEntry {
  readonly href: string;
  readonly labelKey: DashboardNavLabelKey;
  readonly Icon: LucideIcon;
  // `main` items sit above the "Somente Gerente" label, `manager` items below it.
  readonly group: 'main' | 'manager';
  readonly roles: readonly DashboardNavRole[];
  readonly surfaces: {
    readonly sidebar: boolean;
    readonly bottomTab: boolean;
    readonly sheet: boolean;
  };
  readonly toggle?: DashboardNavToggle;
  // Read by the sidebar only (the E2E specs click these).
  readonly testId?: string;
}

const BOTH_ROLES: readonly DashboardNavRole[] = ['STAFF', 'MANAGER'];
const MANAGER_ONLY: readonly DashboardNavRole[] = ['MANAGER'];

export const DASHBOARD_NAV: readonly DashboardNavEntry[] = [
  {
    href: '/dashboard/bookings',
    labelKey: 'nav.bookings',
    Icon: Calendar,
    group: 'main',
    roles: BOTH_ROLES,
    surfaces: { sidebar: true, bottomTab: true, sheet: false },
  },
  {
    href: '/dashboard/schedule',
    labelKey: 'nav.schedule',
    Icon: Clock,
    group: 'main',
    roles: BOTH_ROLES,
    surfaces: { sidebar: true, bottomTab: true, sheet: false },
  },
  {
    href: '/dashboard/services',
    labelKey: 'nav.services',
    Icon: Wrench,
    group: 'main',
    roles: BOTH_ROLES,
    surfaces: { sidebar: true, bottomTab: true, sheet: false },
  },
  {
    href: '/dashboard/loyalty',
    labelKey: 'nav.loyalty',
    Icon: Star,
    group: 'main',
    roles: BOTH_ROLES,
    surfaces: { sidebar: true, bottomTab: true, sheet: false },
  },
  {
    href: '/dashboard/leads',
    labelKey: 'nav.leads',
    Icon: FileText,
    group: 'main',
    roles: BOTH_ROLES,
    surfaces: { sidebar: true, bottomTab: false, sheet: true },
    toggle: 'leadForm',
    testId: 'sidebar-nav-leads',
  },
  {
    href: '/dashboard/resources',
    labelKey: 'nav.resources',
    Icon: Boxes,
    group: 'manager',
    roles: MANAGER_ONLY,
    surfaces: { sidebar: true, bottomTab: false, sheet: true },
    testId: 'sidebar-nav-resources',
  },
  {
    href: '/dashboard/team',
    labelKey: 'nav.team',
    Icon: Users,
    group: 'manager',
    roles: MANAGER_ONLY,
    surfaces: { sidebar: true, bottomTab: false, sheet: true },
  },
  {
    href: '/dashboard/settings',
    labelKey: 'nav.settings',
    Icon: Settings,
    group: 'manager',
    roles: MANAGER_ONLY,
    surfaces: { sidebar: true, bottomTab: false, sheet: true },
  },
  {
    href: '/dashboard/hotsite',
    labelKey: 'nav.hotsite',
    Icon: Globe,
    group: 'manager',
    roles: MANAGER_ONLY,
    surfaces: { sidebar: true, bottomTab: false, sheet: true },
  },
];

export interface ResolvedDashboardNavItem extends DashboardNavEntry {
  // The route's feature is one the tenant does not hold (UC-125): the item is drawn with a padlock.
  readonly locked: boolean;
}

export interface DashboardNav {
  readonly sidebarMain: readonly ResolvedDashboardNavItem[];
  readonly sidebarManager: readonly ResolvedDashboardNavItem[];
  readonly bottomTabs: readonly ResolvedDashboardNavItem[];
  // The sheet's header-less items (either role), then its manager section.
  readonly sheetMain: readonly ResolvedDashboardNavItem[];
  readonly sheetManager: readonly ResolvedDashboardNavItem[];
  // Whether the "Mais" button and the sheet exist for this caller: a manager always has items in
  // it, staff only when a toggled module's item is shown (or locked).
  readonly hasSheet: boolean;
}

interface ResolveInput {
  readonly role: DashboardNavRole;
  // The features the tenant does not hold.
  readonly lockedFeatures: readonly FeatureKey[];
  readonly toggles: DashboardNavToggles;
}

// What each surface draws for this caller. An item is shown to a role it is meant for. A toggled item
// has three states: shown (entitled and switched on), hidden (entitled, switched off) and locked
// (not entitled, shown with a padlock whatever the switch says). The feature always comes from the
// route registry (`ROUTE_FEATURES`), so nothing here names one.
export function resolveDashboardNav({ role, lockedFeatures, toggles }: ResolveInput): DashboardNav {
  const visible = DASHBOARD_NAV.filter((entry) => entry.roles.includes(role))
    .map((entry): ResolvedDashboardNavItem => ({
      ...entry,
      locked: isRouteLocked(entry.href, lockedFeatures),
    }))
    .filter((item) => item.toggle === undefined || toggles[item.toggle] || item.locked);

  const on = (surface: keyof DashboardNavEntry['surfaces'], group?: DashboardNavEntry['group']) =>
    visible.filter(
      (item) => item.surfaces[surface] && (group === undefined || item.group === group),
    );

  const sheetMain = on('sheet', 'main');
  return {
    sidebarMain: on('sidebar', 'main'),
    sidebarManager: on('sidebar', 'manager'),
    bottomTabs: on('bottomTab'),
    sheetMain,
    sheetManager: on('sheet', 'manager'),
    hasSheet: role === 'MANAGER' || sheetMain.length > 0,
  };
}
