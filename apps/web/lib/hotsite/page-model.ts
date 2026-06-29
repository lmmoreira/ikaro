import type {
  AboutModuleData,
  BookingCtaModuleData,
  ContactModuleData,
  FooterModuleData,
  GalleryModuleData,
  HeroModuleData,
  HotsiteManifestResponse,
  HotsiteModuleResponse,
  HotsiteModuleType,
  ServiceListModuleData,
  TestimonialsModuleData,
} from '@ikaro/types';
import {
  AboutModuleDataSchema,
  BookingCtaModuleDataSchema,
  ContactModuleDataSchema,
  FooterModuleDataSchema,
  GalleryModuleDataSchema,
  HeroModuleDataSchema,
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
  | { readonly type: 'FOOTER'; readonly data: FooterModuleData };

export interface HotsiteModuleRenderPlanItem {
  readonly parsed: HotsiteModuleParsed;
  readonly bgVariant: HotsiteSectionBgVariant;
}

const NON_ALTERNATING_TYPES: ReadonlySet<HotsiteModuleType> = new Set([
  'HERO',
  'BOOKING_CTA',
  'FOOTER',
]);

function tryParseModule(module: HotsiteModuleResponse): HotsiteModuleParsed | null {
  switch (module.type) {
    case 'HERO': {
      const r = HeroModuleDataSchema.safeParse(module.data);
      return r.success ? { type: 'HERO', data: r.data } : null;
    }
    case 'SERVICE_LIST': {
      const r = ServiceListModuleDataSchema.safeParse(module.data);
      return r.success ? { type: 'SERVICE_LIST', data: r.data } : null;
    }
    case 'GALLERY': {
      const r = GalleryModuleDataSchema.safeParse(module.data);
      return r.success ? { type: 'GALLERY', data: r.data } : null;
    }
    case 'TESTIMONIALS': {
      const r = TestimonialsModuleDataSchema.safeParse(module.data);
      return r.success ? { type: 'TESTIMONIALS', data: r.data } : null;
    }
    case 'BOOKING_CTA': {
      const r = BookingCtaModuleDataSchema.safeParse(module.data);
      return r.success ? { type: 'BOOKING_CTA', data: r.data } : null;
    }
    case 'ABOUT': {
      const r = AboutModuleDataSchema.safeParse(module.data);
      return r.success ? { type: 'ABOUT', data: r.data } : null;
    }
    case 'CONTACT': {
      const r = ContactModuleDataSchema.safeParse(module.data);
      return r.success ? { type: 'CONTACT', data: r.data } : null;
    }
    case 'FOOTER': {
      const r = FooterModuleDataSchema.safeParse(module.data);
      return r.success ? { type: 'FOOTER', data: r.data } : null;
    }
  }
}

export function resolveHotsiteDisplayName(
  manifest: Pick<HotsiteManifestResponse, 'branding' | 'tenant'>,
): string {
  return manifest.branding.brandName ?? manifest.tenant.name;
}

export function buildHotsiteModuleRenderPlan(
  layout: ReadonlyArray<HotsiteModuleResponse>,
  alternateSectionBg: boolean,
): HotsiteModuleRenderPlanItem[] {
  const items: HotsiteModuleRenderPlanItem[] = [];
  let altIndex = 0;

  for (const module of layout) {
    if (!module.enabled) continue;

    const parsed = tryParseModule(module);
    if (parsed === null) continue;

    const isAlt = alternateSectionBg && altIndex % 2 === 1;
    const participates = !NON_ALTERNATING_TYPES.has(module.type);
    altIndex++;

    items.push({ parsed, bgVariant: participates && isAlt ? 'alt' : 'default' });
  }

  return items;
}
