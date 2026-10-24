import type {
  HotsiteModuleResponse,
  HotsiteModuleType,
  HotsiteNavigationTarget,
  NavigationModuleData,
} from '@ikaro/types';

// The section a navigation item scrolls to, by target. Mirrors the backend's
// NAVIGATION_TARGET_MODULE_TYPE (hotsite-layout.rules.ts); the backend is what enforces that an
// enabled navigation never links to a disabled section, the editor only explains it first.
export const NAVIGATION_TARGET_MODULE: Readonly<
  Record<HotsiteNavigationTarget, HotsiteModuleType>
> = {
  'service-list': 'SERVICE_LIST',
  gallery: 'GALLERY',
  testimonials: 'TESTIMONIALS',
  about: 'ABOUT',
  contact: 'CONTACT',
};

// The picker's order; the Record above makes the compiler reject a target missing from either.
export const NAVIGATION_TARGETS: readonly HotsiteNavigationTarget[] = [
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

// What an enabled NAVIGATION links to on the module about to be turned off. A disabled navigation
// renders nothing and is not checked by the backend, so it never counts.
export function navigationReferences(
  layout: readonly HotsiteModuleResponse[],
  type: HotsiteModuleType,
): { readonly items: number; readonly cta: boolean } {
  const navigation = enabledNavigation(layout);
  if (!navigation) return { items: 0, cta: false };
  const data = navigation.data as unknown as NavigationModuleData;
  return {
    items: data.items.filter((item) => NAVIGATION_TARGET_MODULE[item.target] === type).length,
    cta: type === 'LEAD_FORM' && data.cta?.target === 'lead-form',
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
    const { items, cta, ...rest } = module.data as unknown as NavigationModuleData;
    const keepCta = cta !== undefined && !(type === 'LEAD_FORM' && cta.target === 'lead-form');
    return {
      ...module,
      data: {
        ...rest,
        items: items.filter((item) => NAVIGATION_TARGET_MODULE[item.target] !== type),
        ...(keepCta ? { cta } : {}),
      },
    };
  });
}
