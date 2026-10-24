import { z } from 'zod';
import type {
  HotsiteBrandingResponse,
  HotsiteModuleResponse,
  HotsiteModuleType,
  HotsiteSeoResponse,
} from '@ikaro/types';
import { MODULE_ORDER, materializeLayout } from './default-layout';
import { isValidModuleData } from './module-schemas';
import { isValidPresentation } from './presentation-schema';

export interface ManifestDraft {
  readonly branding: HotsiteBrandingResponse;
  readonly layout: HotsiteModuleResponse[];
  readonly seo: HotsiteSeoResponse;
}

// One reason per distinct failure `parseManifestJson` can detect — ManifestTab maps `code` to a
// localized message (interpolating `max`/`moduleType` where present) instead of showing one
// generic string for every failure.
export type ManifestParseErrorReason =
  | { readonly code: 'invalidSyntax' }
  | { readonly code: 'invalidStructure' }
  | { readonly code: 'tooManyModules'; readonly max: number }
  | { readonly code: 'unknownModuleType'; readonly moduleType: string }
  | { readonly code: 'duplicateModuleType'; readonly moduleType: string }
  | { readonly code: 'invalidModuleData'; readonly moduleType: string }
  | { readonly code: 'invalidPresentation'; readonly moduleType: string }
  | { readonly code: 'navigationNotFirst' };

export type ManifestParseResult =
  | { readonly success: true; readonly value: ManifestDraft }
  | { readonly success: false; readonly error: string; readonly reason: ManifestParseErrorReason };

// Structural only — every field's primitive TYPE from HotsiteBrandingResponse, not the deeper
// business rules (hex format, specific enum members, length caps) that @ikaro/validation's
// HotsiteBrandingSchema enforces server-side. apps/web deliberately never depends on
// @ikaro/validation (its package.json says "never consumed by apps/web") — a value that's the
// right shape but the wrong business value (e.g. a non-hex primaryColor) is still accepted here
// and only rejected on Publish, via the existing backend validation + actionBanner.
const BrandingStructuralSchema = z.object({
  primaryColor: z.string(),
  secondaryColor: z.string(),
  backgroundColor: z.string(),
  textColor: z.string(),
  headingFontFamily: z.string(),
  bodyFontFamily: z.string(),
  logoUrl: z.string(),
  borderRadius: z.string(),
  buttonRadius: z.string().optional(),
  headingWeight: z.number().optional(),
  headingTransform: z.string().optional(),
  buttonStyle: z.string(),
  spacing: z.string(),
  shadowStyle: z.string(),
  buttonBackgroundColor: z.string().optional(),
  buttonTextColor: z.string().optional(),
  heroBgStyle: z.string().optional(),
  alternateSectionBg: z.boolean().optional(),
  dividerStyle: z.string().optional(),
  brandName: z.string().optional(),
  brandTagline: z.string().optional(),
});

const SeoStructuralSchema = z.object({
  title: z.string().nullable(),
  description: z.string().nullable(),
  ogImageUrl: z.string(),
}) satisfies z.ZodType<HotsiteSeoResponse>;

// `presentation` is a sibling of `data` and must be listed here: a Zod object strips unknown keys,
// so leaving it out would silently drop it from every pasted manifest. Its own shape is checked
// in validateLayoutModules (isValidPresentation), not here.
const LayoutModuleEnvelopeSchema = z.object({
  type: z.string(),
  enabled: z.boolean(),
  data: z.record(z.string(), z.unknown()),
  presentation: z.unknown().optional(),
});

const ManifestShapeSchema = z.object({
  branding: BrandingStructuralSchema,
  layout: z.array(LayoutModuleEnvelopeSchema),
  seo: SeoStructuralSchema,
});

const MODULE_TYPE_SET: ReadonlySet<string> = new Set(MODULE_ORDER);

type LayoutModuleEnvelope = z.infer<typeof LayoutModuleEnvelopeSchema>;

// What breaks the *client* the moment Aplicar merges the manifest into `draft` is checked here,
// not left to the backend: an unknown or duplicate `type` (LayoutTab/ModuleConfigShell key their
// rows and dnd-kit ids by `type`, and HotsiteEditor.MODULE_CONFIG_PANELS[type] would be undefined
// for anything outside the known 12), a NAVIGATION that is not first (the layout editor pins it
// there), and a `data` or `presentation` that does not parse. A rule that needs the whole layout —
// a navigation target being an enabled module — is the backend's (HotsiteConfig) and surfaces on
// Publish through the existing banner.
function validateLayoutModules(
  layout: readonly LayoutModuleEnvelope[],
): ManifestParseErrorReason | null {
  if (layout.length > MODULE_ORDER.length) {
    return { code: 'tooManyModules', max: MODULE_ORDER.length };
  }
  const seenTypes = new Set<string>();
  for (const [index, layoutModule] of layout.entries()) {
    if (!MODULE_TYPE_SET.has(layoutModule.type)) {
      return { code: 'unknownModuleType', moduleType: layoutModule.type };
    }
    if (seenTypes.has(layoutModule.type)) {
      return { code: 'duplicateModuleType', moduleType: layoutModule.type };
    }
    seenTypes.add(layoutModule.type);
    if (layoutModule.type === 'NAVIGATION' && index !== 0) {
      return { code: 'navigationNotFirst' };
    }
    if (!isValidModuleData(layoutModule.type as HotsiteModuleType, layoutModule.data)) {
      return { code: 'invalidModuleData', moduleType: layoutModule.type };
    }
    if (
      layoutModule.presentation !== undefined &&
      !isValidPresentation(layoutModule.presentation)
    ) {
      return { code: 'invalidPresentation', moduleType: layoutModule.type };
    }
  }
  return null;
}

// `error` stays plain English for tests/debugging (see the comment on `parseManifestJson` below);
// `reason` is what the UI actually renders, via ManifestTab's localized lookup.
function describeReason(reason: ManifestParseErrorReason): string {
  switch (reason.code) {
    case 'invalidSyntax':
      return 'invalid JSON syntax';
    case 'invalidStructure':
      return 'JSON does not match the expected { branding, layout, seo } structure';
    case 'tooManyModules':
      return `layout must have at most ${reason.max} modules`;
    case 'unknownModuleType':
      return `unknown module type "${reason.moduleType}"`;
    case 'duplicateModuleType':
      return `duplicate module type "${reason.moduleType}"`;
    case 'invalidModuleData':
      return `invalid data for module "${reason.moduleType}"`;
    case 'invalidPresentation':
      return `invalid presentation for module "${reason.moduleType}"`;
    case 'navigationNotFirst':
      return 'the NAVIGATION module must be the first module';
  }
}

// One reason, first failure only — this is a client-side pre-flight sanity check before Aplicar
// merges the edit into `draft`, not a full form-validation UI with per-field messages. The caller
// (ManifestTab) maps `reason.code` to a localized message; `error` is plain English for
// tests/debugging, not end-user copy.
export function parseManifestJson(raw: string): ManifestParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const reason: ManifestParseErrorReason = { code: 'invalidSyntax' };
    return { success: false, error: describeReason(reason), reason };
  }

  const shapeResult = ManifestShapeSchema.safeParse(parsed);
  if (!shapeResult.success) {
    const reason: ManifestParseErrorReason = { code: 'invalidStructure' };
    return { success: false, error: describeReason(reason), reason };
  }

  const layoutError = validateLayoutModules(shapeResult.data.layout);
  if (layoutError) {
    return { success: false, error: describeReason(layoutError), reason: layoutError };
  }

  return {
    success: true,
    value: {
      branding: shapeResult.data.branding as HotsiteBrandingResponse,
      layout: materializeLayout(shapeResult.data.layout as HotsiteModuleResponse[]),
      seo: shapeResult.data.seo,
    },
  };
}
