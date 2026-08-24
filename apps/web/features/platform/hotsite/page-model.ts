import type {
  AboutModuleData,
  BookingCtaModuleData,
  ChatbotModuleData,
  ContactModuleData,
  FooterModuleData,
  GalleryModuleData,
  HeroModuleData,
  HotsiteManifestResponse,
  HotsiteModuleResponse,
  HotsiteModuleType,
  LeadFormModuleData,
  ServiceListModuleData,
  TestimonialsModuleData,
} from '@ikaro/types';
import {
  AboutModuleDataSchema,
  BookingCtaModuleDataSchema,
  ChatbotModuleDataSchema,
  ContactModuleDataSchema,
  FooterModuleDataSchema,
  GalleryModuleDataSchema,
  HeroModuleDataSchema,
  LeadFormModuleDataSchema,
  ServiceListModuleDataSchema,
  TestimonialsModuleDataSchema,
} from './module-schemas';

export type HotsiteSectionBgVariant = 'default' | 'alt';

export type HotsiteModuleParsed =
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

export function buildHotsiteModuleRenderPlan(
  layout: ReadonlyArray<HotsiteModuleResponse>,
  alternateSectionBg: boolean,
): HotsiteModuleRenderPlanItem[] {
  const items: HotsiteModuleRenderPlanItem[] = [];
  let altIndex = 0;

  for (const layoutModule of layout) {
    if (!layoutModule.enabled) continue;

    const parsed = tryParseModule(layoutModule);
    if (parsed === null) continue;

    const isAlt = alternateSectionBg && altIndex % 2 === 1;
    const participates = !NON_ALTERNATING_TYPES.has(layoutModule.type);
    altIndex++;

    items.push({ parsed, bgVariant: participates && isAlt ? 'alt' : 'default' });
  }

  return items;
}
