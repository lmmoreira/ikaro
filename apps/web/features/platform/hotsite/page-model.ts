import type {
  AboutModuleData,
  HotsiteBrandingResponse,
  BookingCtaModuleData,
  ChatbotModuleData,
  ContactModuleData,
  ContentBlockModuleData,
  FooterModuleData,
  GalleryModuleData,
  HeroModuleData,
  HotsiteManifestResponse,
  HotsiteModulePresentation,
  HotsiteModuleResponse,
  HotsiteModuleType,
  HotsiteNavigationItem,
  LeadFormModuleData,
  NavigationModuleData,
  ServiceListModuleData,
  TestimonialsModuleData,
} from '@ikaro/types';
import {
  AboutModuleDataSchema,
  BookingCtaModuleDataSchema,
  ChatbotModuleDataSchema,
  ContactModuleDataSchema,
  ContentBlockModuleDataSchema,
  FooterModuleDataSchema,
  GalleryModuleDataSchema,
  HeroModuleDataSchema,
  LeadFormModuleDataSchema,
  NavigationModuleDataSchema,
  ServiceListModuleDataSchema,
  TestimonialsModuleDataSchema,
} from './module-schemas';
import type { SectionTokens } from './apply-branding';
import { resolveItemPresentation, resolveItemTints } from './presentation-tokens';
import type { SectionTint } from './section-tints';

export type HotsiteSectionBgVariant = 'default' | 'alt';

export type HotsiteModuleParsed =
  | { readonly type: 'NAVIGATION'; readonly data: NavigationModuleData }
  | { readonly type: 'CONTENT_BLOCK'; readonly data: ContentBlockModuleData }
  | { readonly type: 'HERO'; readonly data: HeroModuleData }
  | { readonly type: 'SERVICE_LIST'; readonly data: ServiceListModuleData }
  | { readonly type: 'GALLERY'; readonly data: GalleryModuleData }
  | { readonly type: 'TESTIMONIALS'; readonly data: TestimonialsModuleData }
  | { readonly type: 'BOOKING_CTA'; readonly data: BookingCtaModuleData }
  | { readonly type: 'ABOUT'; readonly data: AboutModuleData }
  | { readonly type: 'CONTACT'; readonly data: ContactModuleData }
  | { readonly type: 'FOOTER'; readonly data: FooterModuleData }
  | { readonly type: 'CHATBOT'; readonly data: ChatbotModuleData }
  | { readonly type: 'LEAD_FORM'; readonly data: LeadFormModuleData };

export interface HotsiteModuleRenderPlanItem {
  readonly parsed: HotsiteModuleParsed;
  readonly bgVariant: HotsiteSectionBgVariant;
  // The module's own section presentation, only when it parses. An invalid one is ignored — the
  // section renders with its defaults — and never removes the module the way malformed `data` does
  // (a stored manifest can predate a tightened rule; a cosmetic field must not blank a section).
  readonly presentation?: HotsiteModulePresentation;
  // The scoped contrast tokens for `presentation.surface`, present only when the module sets one
  // and the plan was built with the tenant's branding. HotsiteSectionShell puts them on the
  // section element; nothing else reads them.
  readonly sectionTokens?: SectionTokens;
  readonly tints?: readonly [SectionTint, SectionTint, SectionTint];
}

// CHATBOT included: the bubble variant is a fixed-position floating element with its own
// self-contained background (not a full-width section), and the inline variant uses a fixed
// var(--ba-background), same reasoning as HERO/BOOKING_CTA/FOOTER's own self-contained treatment.
// LEAD_FORM included for the same reason as BOOKING_CTA: it manages its own section background
// via bgStyle (primary/background), same shape family, same self-contained treatment (M20-S07).
const NON_ALTERNATING_TYPES: ReadonlySet<HotsiteModuleType> = new Set([
  'HERO',
  'BOOKING_CTA',
  'FOOTER',
  'CHATBOT',
  'LEAD_FORM',
]);

const MODULE_SCHEMAS = {
  NAVIGATION: NavigationModuleDataSchema,
  CONTENT_BLOCK: ContentBlockModuleDataSchema,
  HERO: HeroModuleDataSchema,
  SERVICE_LIST: ServiceListModuleDataSchema,
  GALLERY: GalleryModuleDataSchema,
  TESTIMONIALS: TestimonialsModuleDataSchema,
  BOOKING_CTA: BookingCtaModuleDataSchema,
  ABOUT: AboutModuleDataSchema,
  CONTACT: ContactModuleDataSchema,
  FOOTER: FooterModuleDataSchema,
  CHATBOT: ChatbotModuleDataSchema,
  LEAD_FORM: LeadFormModuleDataSchema,
} satisfies Record<
  HotsiteModuleType,
  { safeParse(data: unknown): { success: boolean; data?: unknown } }
>;

function tryParseModule(module: HotsiteModuleResponse): HotsiteModuleParsed | null {
  const r = MODULE_SCHEMAS[module.type].safeParse(module.data);
  return r.success ? ({ type: module.type, data: r.data } as HotsiteModuleParsed) : null;
}

export function resolveHotsiteDisplayName(
  manifest: Pick<HotsiteManifestResponse, 'branding' | 'tenant'>,
): string {
  return manifest.branding.brandName ?? manifest.tenant.name;
}

// Types whose rendering doesn't participate in the normal divider rhythm — FOOTER (always
// last, its own visual treatment) and CHATBOT's 'bubble' variant (position: fixed, outside
// document flow). A divider must be skipped both before AND after one of these types, or the
// module immediately following it would still render its own leading divider as a stray
// orphaned line unrelated to anything visible nearby (PR #385 review, Codex — the original
// page.tsx fix only checked the current module's own type, missing the module that follows).
const NO_DIVIDER_TYPES: ReadonlySet<HotsiteModuleType> = new Set(['FOOTER', 'CHATBOT']);

export function shouldSkipDivider(
  index: number,
  type: HotsiteModuleType,
  previousType: HotsiteModuleType | undefined,
): boolean {
  return (
    index === 0 ||
    NO_DIVIDER_TYPES.has(type) ||
    (previousType !== undefined && NO_DIVIDER_TYPES.has(previousType))
  );
}

// NAVIGATION is page chrome, consumed by the top bar through resolveHotsiteNavigation(); it is not
// a section, so it never becomes a plan item, never takes part in alternation, and never shifts
// the "first section has no divider" rule.
const NON_SECTION_TYPES: ReadonlySet<HotsiteModuleType> = new Set(['NAVIGATION']);

// The module type a navigation item's `target` anchor points at (the section's own DOM id).
const NAVIGATION_TARGET_TYPE: Readonly<Record<HotsiteNavigationItem['target'], HotsiteModuleType>> =
  {
    'service-list': 'SERVICE_LIST',
    gallery: 'GALLERY',
    testimonials: 'TESTIMONIALS',
    about: 'ABOUT',
    contact: 'CONTACT',
  };

// A plan item whose component actually draws a section. Gallery and Testimonials render nothing for
// valid but empty data (no images, no items), so a link to them would point at an anchor that does
// not exist.
function rendersSection(item: HotsiteModuleRenderPlanItem): boolean {
  const { parsed } = item;
  if (parsed.type === 'GALLERY') return parsed.data.images.length > 0;
  if (parsed.type === 'TESTIMONIALS') return parsed.data.items.length > 0;
  return true;
}

// The links the top bar renders: only items whose target section actually appears on the page. A
// target that is disabled, absent, whose module data failed to parse, or that renders nothing
// because it is empty is dropped here, so a visitor never gets a link to a section that is not on
// the page. Nothing when NAVIGATION is absent, disabled, or has malformed data.
export function resolveHotsiteNavigation(
  layout: ReadonlyArray<HotsiteModuleResponse>,
  plan: ReadonlyArray<HotsiteModuleRenderPlanItem>,
): HotsiteNavigationItem[] {
  const navigation = layout.find((layoutModule) => layoutModule.type === 'NAVIGATION');
  if (!navigation?.enabled) return [];
  const parsed = NavigationModuleDataSchema.safeParse(navigation.data);
  if (!parsed.success) return [];

  const renderedTypes = new Set<HotsiteModuleType>(
    plan.filter(rendersSection).map((item) => item.parsed.type),
  );
  return parsed.data.items.filter((item) => renderedTypes.has(NAVIGATION_TARGET_TYPE[item.target]));
}

// A header CTA belongs to the same enabled, validated NAVIGATION entry as the section links.
export function resolveHotsiteNavigationCta(
  layout: ReadonlyArray<HotsiteModuleResponse>,
): NavigationModuleData['cta'] | undefined {
  const navigation = layout.find((module) => module.type === 'NAVIGATION');
  if (!navigation?.enabled) return undefined;
  const parsed = NavigationModuleDataSchema.safeParse(navigation.data);
  return parsed.success ? parsed.data.cta : undefined;
}

export function buildHotsiteModuleRenderPlan(
  layout: ReadonlyArray<HotsiteModuleResponse>,
  alternateSectionBg: boolean,
  branding?: HotsiteBrandingResponse,
): HotsiteModuleRenderPlanItem[] {
  const items: HotsiteModuleRenderPlanItem[] = [];
  let altIndex = 0;

  for (const layoutModule of layout) {
    if (!layoutModule.enabled || NON_SECTION_TYPES.has(layoutModule.type)) continue;

    const parsed = tryParseModule(layoutModule);
    if (parsed === null) continue;

    const isAlt = alternateSectionBg && altIndex % 2 === 1;
    const participates = !NON_ALTERNATING_TYPES.has(layoutModule.type);
    altIndex++;

    const bgVariant = participates && isAlt ? 'alt' : 'default';
    items.push({
      parsed,
      bgVariant,
      ...resolveItemPresentation(layoutModule, branding, bgVariant),
      ...resolveItemTints(layoutModule, parsed, branding, bgVariant),
    });
  }

  return items;
}

// The top-bar links for a hotsite route that does not render the module sections itself (booking,
// availability alert): the same plan the home page builds, reduced to the NAVIGATION links.
export function resolveManifestNavigation(
  manifest: Pick<HotsiteManifestResponse, 'layout' | 'branding'>,
): HotsiteNavigationItem[] {
  const plan = buildHotsiteModuleRenderPlan(
    manifest.layout,
    manifest.branding.alternateSectionBg ?? false,
    manifest.branding,
  );
  return resolveHotsiteNavigation(manifest.layout, plan);
}
