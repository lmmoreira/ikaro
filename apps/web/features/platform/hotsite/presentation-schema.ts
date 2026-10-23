import { z } from 'zod';
import type { HotsiteModulePresentation } from '@ikaro/types';

// Independent mirror of @ikaro/validation's HotsiteModulePresentationSchema (apps/web must never
// import that package); both run the shared cases in
// @ikaro/types/testing/hotsite-module-contract, so they cannot drift.
//
// Shape only. Which module types accept a `presentation` at all, and which accept
// `presentation.background`, are layout rules the backend owns (HotsiteConfig), shown on Publish.

const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const hexColor = (): z.ZodString => z.string().regex(HEX_COLOR_PATTERN);
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
        position: z.enum(['left', 'center', 'right']).optional(),
      })
      .optional(),
    overlay: OverlaySchema.optional(),
  })
  // customColor is required for the 'custom' surface and rejected for every other one.
  .refine(
    (presentation) =>
      (presentation.surface === 'custom') === (presentation.customColor !== undefined),
  ) satisfies z.ZodType<HotsiteModulePresentation>;

export function isValidPresentation(value: unknown): value is HotsiteModulePresentation {
  return HotsiteModulePresentationSchema.safeParse(value).success;
}
