import { z } from 'zod';
import type {
  HotsiteBrandingResponse,
  HotsiteModuleResponse,
  HotsiteModuleType,
  HotsiteSeoResponse,
} from '@ikaro/types';
import { MODULE_ORDER, materializeLayout } from './default-layout';
import { isValidModuleData } from './module-schemas';

export interface ManifestDraft {
  readonly branding: HotsiteBrandingResponse;
  readonly layout: HotsiteModuleResponse[];
  readonly seo: HotsiteSeoResponse;
}

export type ManifestParseResult =
  | { readonly success: true; readonly value: ManifestDraft }
  | { readonly success: false; readonly error: string };

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
}) satisfies z.ZodType<HotsiteSeoResponse>;

const LayoutModuleEnvelopeSchema = z.object({
  type: z.string(),
  enabled: z.boolean(),
  data: z.record(z.string(), z.unknown()),
});

const ManifestShapeSchema = z.object({
  branding: BrandingStructuralSchema,
  layout: z.array(LayoutModuleEnvelopeSchema),
  seo: SeoStructuralSchema,
});

const MODULE_TYPE_SET: ReadonlySet<string> = new Set(MODULE_ORDER);

type LayoutModuleEnvelope = z.infer<typeof LayoutModuleEnvelopeSchema>;

// `type` membership and uniqueness are checked here (not left to the backend) because an unknown
// or duplicate type breaks the *client* immediately once Aplicar merges it into `draft` —
// LayoutTab/ModuleConfigShell key their rows and dnd-kit ids by `type`, and
// HotsiteEditor.MODULE_CONFIG_PANELS[type] would be undefined for anything outside the known 8.
function validateLayoutModules(layout: readonly LayoutModuleEnvelope[]): string | null {
  if (layout.length > MODULE_ORDER.length) {
    return `layout must have at most ${MODULE_ORDER.length} modules`;
  }
  const seenTypes = new Set<string>();
  for (const module of layout) {
    if (!MODULE_TYPE_SET.has(module.type)) {
      return `unknown module type "${module.type}"`;
    }
    if (seenTypes.has(module.type)) {
      return `duplicate module type "${module.type}"`;
    }
    seenTypes.add(module.type);
    if (!isValidModuleData(module.type as HotsiteModuleType, module.data)) {
      return `invalid data for module "${module.type}"`;
    }
  }
  return null;
}

// One error string, first failure only — this is a client-side pre-flight sanity check before
// Aplicar merges the edit into `draft`, not a full form-validation UI with per-field messages.
// The caller (ManifestTab) shows a single static translated message on any failure; `error` here
// is plain English for tests/debugging, not end-user copy.
export function parseManifestJson(raw: string): ManifestParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { success: false, error: 'invalid JSON syntax' };
  }

  const shapeResult = ManifestShapeSchema.safeParse(parsed);
  if (!shapeResult.success) {
    return {
      success: false,
      error: 'JSON does not match the expected { branding, layout, seo } structure',
    };
  }

  const layoutError = validateLayoutModules(shapeResult.data.layout);
  if (layoutError) {
    return { success: false, error: layoutError };
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
