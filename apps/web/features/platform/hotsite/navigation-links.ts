import {
  HOTSITE_LINK_TARGET_MODULE,
  NAVIGATION_CTA_REQUIRED_MODULE,
  NavigationModuleDataSchema,
  type HotsiteModuleResponse,
  type HotsiteModuleType,
  type HotsiteNavigationTarget,
  type NavigationCtaTarget,
  type NavigationModuleData,
} from '@ikaro/types';

// What a navigation item scrolls to (and what the header button needs) is read from the shared
// maps in @ikaro/types, the same ones the backend's layout rule reads: the backend is what enforces
// that an enabled navigation never links to a disabled section, the editor only explains it first.

// The picker's order; navigation-links.spec pins it against the schema's item targets.
export const NAVIGATION_TARGETS: readonly HotsiteNavigationTarget[] = [
  'home',
  'service-list',
  'gallery',
  'testimonials',
  'about',
  'contact',
];

export const NAVIGATION_MAX_ITEMS = 6;
export const NAVIGATION_LABEL_MAX_LENGTH = 30;

// Moves the item at `from` to `to`, shifting the ones between. A move outside the list, or onto
// itself, returns the items unchanged.
export function moveNavigationItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  if (from === to || from < 0 || to < 0 || from >= next.length || to >= next.length) return next;
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function isNavigationTargetEnabled(
  layout: readonly HotsiteModuleResponse[],
  target: HotsiteNavigationTarget,
): boolean {
  const type = HOTSITE_LINK_TARGET_MODULE[target];
  return type === null || isModuleEnabled(layout, type);
}

// Whether the module the header button needs is enabled (`booking-form` needs none), so the picker
// can disable an option that the backend would refuse on save.
export function isNavigationCtaTargetEnabled(
  layout: readonly HotsiteModuleResponse[],
  target: NavigationCtaTarget,
): boolean {
  const type = NAVIGATION_CTA_REQUIRED_MODULE[target];
  return type === null || isModuleEnabled(layout, type);
}

export function isModuleEnabled(
  layout: readonly HotsiteModuleResponse[],
  type: HotsiteModuleType,
): boolean {
  return layout.some((module) => module.type === type && module.enabled);
}

function enabledNavigation(
  layout: readonly HotsiteModuleResponse[],
): HotsiteModuleResponse | undefined {
  return layout.find((module) => module.type === 'NAVIGATION' && module.enabled);
}

// The navigation's data when it parses. A committed draft always does (an incomplete buffer is
// never applied), so an unparseable value is simply treated as having no links to protect.
function navigationData(module: HotsiteModuleResponse): NavigationModuleData | undefined {
  const parsed = NavigationModuleDataSchema.safeParse(module.data);
  return parsed.success ? parsed.data : undefined;
}

// What an enabled NAVIGATION links to on the module about to be turned off. A disabled navigation
// renders nothing and is not checked by the backend, so it never counts.
export function navigationReferences(
  layout: readonly HotsiteModuleResponse[],
  type: HotsiteModuleType,
): { readonly items: number; readonly cta: boolean } {
  const navigation = enabledNavigation(layout);
  const data = navigation && navigationData(navigation);
  if (!data) return { items: 0, cta: false };
  return {
    items: data.items.filter((item) => HOTSITE_LINK_TARGET_MODULE[item.target] === type).length,
    cta: data.cta !== undefined && NAVIGATION_CTA_REQUIRED_MODULE[data.cta.target] === type,
  };
}

export function hasNavigationReferences(
  layout: readonly HotsiteModuleResponse[],
  type: HotsiteModuleType,
): boolean {
  const references = navigationReferences(layout, type);
  return references.items > 0 || references.cta;
}

// The layout with every navigation link to `type` removed and `type` itself disabled — the one
// change the "remove link and disable" confirmation makes.
export function disableModuleRemovingLinks(
  layout: readonly HotsiteModuleResponse[],
  type: HotsiteModuleType,
): HotsiteModuleResponse[] {
  return layout.map((module) => {
    if (module.type === type) return { ...module, enabled: false };
    if (module.type !== 'NAVIGATION') return module;
    const data = navigationData(module);
    if (!data) return module;
    const { items, cta, ...rest } = data;
    const keepCta = cta !== undefined && NAVIGATION_CTA_REQUIRED_MODULE[cta.target] !== type;
    return {
      ...module,
      data: {
        ...rest,
        items: items.filter((item) => HOTSITE_LINK_TARGET_MODULE[item.target] !== type),
        ...(keepCta ? { cta } : {}),
      },
    };
  });
}
