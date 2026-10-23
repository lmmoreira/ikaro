import { z } from 'zod';
import { GenericErrorCode } from '@ikaro/types';
import { HEX_COLOR_PATTERN } from './hotsite';

// The canonical, request-boundary schema for every hotsite layout module (TD56-S01). It replaces
// the former `data: z.record(z.string(), z.unknown())`, so a malformed module is rejected with a
// field-level violation (`layout.0.data.itemAction`) before it ever reaches the aggregate.
//
// Two shapes of "closed", deliberately:
//   - the two types added by TD56 (NAVIGATION, CONTENT_BLOCK) use strict objects: an unknown key
//     is rejected, because no stored manifest can hold one yet;
//   - the ten pre-TD56 types use loose objects whose declared keys are fully validated (required
//     fields, enums, bounds) while unknown keys are tolerated — exactly what apps/web's
//     module-schemas.ts does today, so every manifest the current editors can produce still saves.
// apps/web must never import this package, so its schemas stay an independent mirror; the shared
// fixtures in @ikaro/types/testing/hotsite-module-contract keep the two in step.
//
// Cross-field rules that need the whole layout (NAVIGATION first, a navigation target being an
// enabled module, which types accept `presentation`) are NOT here — HotsiteConfig owns them, each
// with a typed domain error (docs/ENGINEERING_RULES_SHARED.md § Single source of truth for a
// validation rule's code).

const hexColor = (): z.ZodString =>
  z.string().regex(HEX_COLOR_PATTERN, { error: 'must be a #RRGGBB hex color' });

const CTA_TARGET = z.enum([
  'booking-form',
  'service-list',
  'gallery',
  'testimonials',
  'about',
  'contact',
]);

const HORIZONTAL_POSITION = z.enum(['left', 'center', 'right']);
const VERTICAL_POSITION = z.enum(['top', 'center', 'bottom']);
const IMMERSIVE_VARIANT = z.enum(['centered', 'left-aligned', 'immersive']);

// ─── Pre-TD56 modules (loose) ────────────────────────────────────────────────

const HeroDataSchema = z.looseObject({
  variant: IMMERSIVE_VARIANT,
  title: z.string(),
  subtitle: z.string().optional(),
  eyebrow: z.string().optional(),
  backgroundImageUrl: z.string().nullable().optional(),
  backgroundImagePosition: HORIZONTAL_POSITION.optional(),
  contentPositionX: HORIZONTAL_POSITION.optional(),
  contentPositionY: VERTICAL_POSITION.optional(),
  ctaLabel: z.string(),
  ctaTarget: CTA_TARGET,
  secondaryCtaLabel: z.string().optional(),
  secondaryCtaTarget: CTA_TARGET.optional(),
  rightPanel: z.enum(['none', 'image', 'brand-card']).optional(),
});

// Closed set: adding a field to the detail page is a new story, so unknown keys are rejected here
// even though the surrounding SERVICE_LIST data is loose.
const ServiceDetailPageSchema = z.strictObject({
  heroStyle: z.enum(['cover', 'compact']),
  galleryLayout: z.enum(['grid', 'featured']),
  showPrice: z.boolean(),
  showDuration: z.boolean(),
  showLoyaltyPoints: z.boolean(),
  bookingCtaLabel: z.string().max(40).optional(),
});

const ServiceListDataSchema = z.looseObject({
  title: z.string().optional(),
  eyebrow: z.string().optional(),
  showPrices: z.boolean(),
  showPoints: z.boolean(),
  layout: z.enum(['grid', 'list', 'numbered', 'feature-cards']),
  itemAction: z.enum(['details', 'booking', 'none']).optional(),
  itemCtaLabel: z.string().max(40).optional(),
  detailPage: ServiceDetailPageSchema.optional(),
});

const GalleryImageSchema = z.looseObject({
  url: z.string(),
  caption: z.string().optional(),
  source: z.enum(['booking', 'upload']),
  bookingId: z.string().optional(),
  photoType: z.enum(['before', 'after']).optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});

const GalleryDataSchema = z.looseObject({
  title: z.string().optional(),
  eyebrow: z.string().optional(),
  images: z.array(GalleryImageSchema),
  layout: z.enum(['grid', 'masonry', 'featured', 'portfolio']),
  maxVisible: z.number().int().min(1),
  featuredPosition: z.enum(['left', 'right']).optional(),
});

const TestimonialSchema = z.looseObject({
  authorName: z.string(),
  text: z.string(),
  rating: z
    .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)])
    .optional(),
  avatarUrl: z.string().nullable().optional(),
});

const TestimonialsDataSchema = z.looseObject({
  title: z.string().optional(),
  eyebrow: z.string().optional(),
  items: z.array(TestimonialSchema),
  layout: z.enum(['grid', 'carousel', 'editorial-quote']),
});

const BookingCtaDataSchema = z.looseObject({
  variant: IMMERSIVE_VARIANT.optional(),
  title: z.string(),
  subtitle: z.string().optional(),
  eyebrow: z.string().optional(),
  ctaLabel: z.string(),
  backgroundImageUrl: z.string().nullable().optional(),
  backgroundImagePosition: HORIZONTAL_POSITION.optional(),
  carouselDays: z.number().int().min(1).max(90).optional(),
  datePickerType: z.enum(['carousel', 'calendar']).optional(),
  bgStyle: z.enum(['primary', 'background']).optional(),
  rightPanel: z.enum(['none', 'brand-card']).optional(),
  contentPositionX: HORIZONTAL_POSITION.optional(),
  contentPositionY: VERTICAL_POSITION.optional(),
});

const AboutDataSchema = z.looseObject({
  title: z.string(),
  body: z.string(),
  eyebrow: z.string().optional(),
  imageUrl: z.string().nullable().optional(),
  imagePosition: z.enum(['left', 'right']),
  variant: z.enum(['split', 'editorial']).optional(),
});

const ContactDataSchema = z.looseObject({
  title: z.string().optional(),
  eyebrow: z.string().optional(),
  showAddress: z.boolean(),
  showPhone: z.boolean(),
  showWhatsapp: z.boolean(),
  showEmail: z.boolean(),
  showMap: z.boolean(),
  showInstagram: z.boolean().optional(),
  showFacebook: z.boolean().optional(),
  displayStyle: z.enum(['list', 'icon-cards']).optional(),
  whatsappCtaLabel: z.string().optional(),
});

const FooterDataSchema = z.looseObject({
  tagline: z.string().optional(),
  copyrightNote: z.string().optional(),
  showWhatsapp: z.boolean().optional(),
});

const ChatbotDataSchema = z.looseObject({
  variant: z.enum(['bubble', 'inline']).optional(),
  accentColor: z.enum(['primary', 'secondary']).optional(),
  botName: z.string().optional(),
  welcomeMessage: z.string().optional(),
});

const LeadFormDataSchema = z
  .looseObject({
    title: z.string(),
    subtitle: z.string().optional(),
    eyebrow: z.string().optional(),
    ctaLabel: z.string(),
    variant: IMMERSIVE_VARIANT.optional(),
    backgroundImageUrl: z.string().nullable().optional(),
    backgroundImagePosition: HORIZONTAL_POSITION.optional(),
    bgStyle: z.enum(['primary', 'background']).optional(),
  })
  .refine((data) => !('audienceMode' in data) && !('questions' in data), {
    // audienceMode/questions live in LeadFormConfig, never in HotsiteConfig.layout[] — that blob
    // feeds the public-cached manifest (docs/DOMAIN_MODEL.md § LeadFormConfig "Cross-aggregate
    // save"). Without this check, the loose `data` would let a caller smuggle both fields into
    // the cached layout entry directly, bypassing LeadFormConfig's own validation (the 20-question
    // cap included) entirely (M20-S08 PR #429 Codex review finding, 2026-08-26 — the frontend's
    // stripLeadFormConfig() is a UI courtesy, not an API boundary).
    error:
      "a LEAD_FORM module's own data must not include audienceMode or questions — send them as top-level fields on PATCH /v1/tenants/hotsite instead",
    params: { code: GenericErrorCode.VALUE_INVALID },
  });

// ─── TD56 modules (strict) ───────────────────────────────────────────────────

const NavigationDataSchema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        label: z.string().min(1).max(30),
        target: z.enum(['service-list', 'gallery', 'testimonials', 'about', 'contact']),
      }),
    )
    .max(6),
});

const contentBlockCommon = {
  align: z.enum(['left', 'center', 'right']).optional(),
  eyebrow: z.string().max(60).optional(),
  title: z.string().max(120),
  body: z.string().max(1000).optional(),
  cta: z.strictObject({ label: z.string().max(40), target: CTA_TARGET }).optional(),
};

const ContentBlockDataSchema = z.discriminatedUnion('variant', [
  z.strictObject({
    variant: z.literal('trust-grid'),
    ...contentBlockCommon,
    items: z
      .array(
        z.strictObject({ label: z.string().max(60), description: z.string().max(140).optional() }),
      )
      .min(2)
      .max(6),
  }),
  z.strictObject({
    variant: z.literal('process-steps'),
    ...contentBlockCommon,
    items: z
      .array(z.strictObject({ title: z.string().max(60), body: z.string().max(240) }))
      .min(2)
      .max(6),
  }),
  z.strictObject({
    variant: z.literal('collage-callout'),
    ...contentBlockCommon,
    // The only image slot inside CONTENT_BLOCK.data. An empty `alt` marks the image decorative.
    images: z
      .array(z.strictObject({ url: z.string().min(1), alt: z.string().max(120).optional() }))
      .min(2)
      .max(4),
  }),
  z.strictObject({
    variant: z.literal('technical-callout'),
    ...contentBlockCommon,
    facts: z
      .array(z.strictObject({ value: z.string().max(20), label: z.string().max(40) }))
      .max(4)
      .optional(),
  }),
  z.strictObject({ variant: z.literal('image-statement'), ...contentBlockCommon }),
  z.strictObject({ variant: z.literal('immersive-statement'), ...contentBlockCommon }),
]);

// ─── Section presentation ────────────────────────────────────────────────────

const opacity = (): z.ZodNumber => z.number().min(0).max(1);

const OverlaySchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('none') }),
  z.strictObject({ type: z.literal('solid'), color: hexColor(), opacity: opacity() }),
  z.strictObject({
    type: z.literal('linear-gradient'),
    direction: z.enum(['to-right', 'to-left', 'to-bottom', 'to-top']),
    fromColor: hexColor(),
    fromOpacity: opacity(),
    toColor: hexColor(),
    toOpacity: opacity(),
  }),
]);

export const HotsiteModulePresentationSchema = z
  .strictObject({
    surface: z.enum(['background', 'secondary', 'primary', 'custom']).optional(),
    customColor: hexColor().optional(),
    contentWidth: z.enum(['narrow', 'standard', 'wide', 'full']).optional(),
    minHeight: z.enum(['auto', 'sm', 'md', 'lg', 'viewport']).optional(),
    padding: z.enum(['none', 'compact', 'comfortable', 'spacious']).optional(),
    background: z
      .strictObject({
        imageUrl: z.string().nullable(),
        position: HORIZONTAL_POSITION.optional(),
      })
      .optional(),
    overlay: OverlaySchema.optional(),
  })
  .superRefine((presentation, ctx) => {
    const isCustom = presentation.surface === 'custom';
    const hasCustomColor = presentation.customColor !== undefined;
    if (isCustom === hasCustomColor) return;
    ctx.addIssue({
      code: 'custom',
      message: isCustom
        ? "surface 'custom' requires customColor"
        : "customColor is only allowed with surface 'custom'",
      path: ['customColor'],
      params: { code: GenericErrorCode.VALUE_INVALID },
    });
  });

// ─── The module entry ────────────────────────────────────────────────────────

const entry = <T extends string, D extends z.ZodType>(type: T, data: D) =>
  z.object({
    type: z.literal(type),
    enabled: z.boolean(),
    data,
    presentation: HotsiteModulePresentationSchema.optional(),
  });

// The literal `type` of each member is what lets Zod build the discriminated union. The exhaustive
// check against HOTSITE_MODULE_TYPES lives in hotsite-modules.spec.ts, so a type added to the
// canonical tuple without a schema here fails a test.
export const HotsiteModuleSchema = z.discriminatedUnion('type', [
  entry('NAVIGATION', NavigationDataSchema),
  entry('HERO', HeroDataSchema),
  entry('SERVICE_LIST', ServiceListDataSchema),
  entry('GALLERY', GalleryDataSchema),
  entry('TESTIMONIALS', TestimonialsDataSchema),
  entry('BOOKING_CTA', BookingCtaDataSchema),
  entry('ABOUT', AboutDataSchema),
  entry('CONTENT_BLOCK', ContentBlockDataSchema),
  entry('CONTACT', ContactDataSchema),
  entry('FOOTER', FooterDataSchema),
  entry('CHATBOT', ChatbotDataSchema),
  entry('LEAD_FORM', LeadFormDataSchema),
]);

export type HotsiteModuleInput = z.infer<typeof HotsiteModuleSchema>;
