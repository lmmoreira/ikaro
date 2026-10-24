import { z } from 'zod';
import { GenericErrorCode } from './error-codes';
import type {
  ContentBlockModuleData,
  HotsiteModulePresentation,
  NavigationModuleData,
  ServiceDetailPageSettings,
} from './hotsite';

// The closed hotsite shapes that exist exactly once for every app: NAVIGATION, CONTENT_BLOCK, a
// module's section `presentation` and the service detail-page settings. They are strict objects
// with no business rule that differs between the request boundary (@ikaro/validation, backend and
// BFF) and the client (apps/web, which must never import @ikaro/validation), so both import this
// one definition instead of keeping two copies in step. The older module shapes, which are loose
// and whose rules the web already tolerated, stay mirrored in each app and are held together by
// the fixtures in ./testing/hotsite-module-contract.
//
// Cross-field rules that need the whole layout (NAVIGATION first, a navigation target being an
// enabled module, which module types accept `presentation`) are not here: HotsiteConfig owns them.

const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const hexColor = (): z.ZodString =>
  z.string().regex(HEX_COLOR_PATTERN, { error: 'must be a #RRGGBB hex color' });
const opacity = (): z.ZodNumber => z.number().min(0).max(1);

export const HotsiteCtaTargetSchema = z.enum([
  'booking-form',
  'service-list',
  'gallery',
  'testimonials',
  'about',
  'contact',
]);

export const HotsiteHorizontalPositionSchema = z.enum(['left', 'center', 'right']);

export const ServiceDetailPageSettingsSchema = z.strictObject({
  heroStyle: z.enum(['cover', 'compact']),
  galleryLayout: z.enum(['grid', 'featured']),
  showPrice: z.boolean(),
  showDuration: z.boolean(),
  showLoyaltyPoints: z.boolean(),
  bookingCtaLabel: z.string().max(40).optional(),
}) satisfies z.ZodType<ServiceDetailPageSettings>;

export const NavigationModuleDataSchema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        label: z.string().min(1).max(30),
        target: z.enum(['service-list', 'gallery', 'testimonials', 'about', 'contact']),
      }),
    )
    .max(6),
  cta: z
    .strictObject({
      label: z.string().min(1).max(30),
      target: z.enum(['booking-form', 'lead-form']),
    })
    .optional(),
}) satisfies z.ZodType<NavigationModuleData>;

const contentBlockCommon = {
  align: z.enum(['left', 'center', 'right']).optional(),
  eyebrow: z.string().max(60).optional(),
  title: z.string().max(120),
  body: z.string().max(1000).optional(),
  cta: z.strictObject({ label: z.string().max(40), target: HotsiteCtaTargetSchema }).optional(),
};

export const ContentBlockModuleDataSchema = z.discriminatedUnion('variant', [
  z.strictObject({
    variant: z.literal('trust-grid'),
    ...contentBlockCommon,
    appearance: z.enum(['rule', 'tiles']).optional(),
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
    appearance: z.enum(['plain', 'ruled']).optional(),
    items: z
      .array(
        z.strictObject({
          title: z.string().max(60),
          body: z.string().max(240),
          label: z.string().max(30).optional(),
        }),
      )
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
    factsPlacement: z.enum(['side', 'kicker']).optional(),
  }),
  z.strictObject({ variant: z.literal('image-statement'), ...contentBlockCommon }),
  z.strictObject({ variant: z.literal('immersive-statement'), ...contentBlockCommon }),
]) satisfies z.ZodType<ContentBlockModuleData>;

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
        position: HotsiteHorizontalPositionSchema.optional(),
      })
      .optional(),
    overlay: OverlaySchema.optional(),
  })
  // customColor is required for the 'custom' surface and rejected for every other one.
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
  }) satisfies z.ZodType<HotsiteModulePresentation>;
