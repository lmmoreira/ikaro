import type {
  ApplyHotsiteTemplateRequest,
  ApplyHotsiteTemplateResponse,
  HotsiteAdminContentResponse,
  HotsiteModuleResponse,
  HotsiteModuleType,
  HotsiteTemplateCapability,
  HotsiteTemplateDraftContent,
} from '@ikaro/types';
import { isStructurallyEqual } from '@/features/platform/hotsite/canonical-json';
import { collectModuleImagePaths } from '@/features/platform/hotsite/map-hotsite-image-fields';
import { stripResolvedImageUrls } from '@/features/platform/hotsite/strip-resolved-image-urls';

// The pure boundary of the template picker: everything about applying a template and undoing it
// that needs no React. HotsiteEditor's state hook (useHotsiteTemplateApplication) drives it.

// The modules whose own data an apply keeps (the backend's preservation matrix, HotsiteTemplate-
// Materializer): the lead form and chatbot are operational settings, and a non-empty gallery or
// testimonial list is the tenant's own content. Their images survive an apply, so they never count
// as "about to be replaced".
const KEEPS_OWN_DATA: ReadonlySet<HotsiteModuleType> = new Set([
  'LEAD_FORM',
  'CHATBOT',
  'GALLERY',
  'TESTIMONIALS',
]);

function replacedImagePaths(module: HotsiteModuleResponse): string[] {
  // A kept module still loses its section backdrop: `presentation` always comes from the template.
  return collectModuleImagePaths(
    KEEPS_OWN_DATA.has(module.type) ? { ...module, data: {} } : module,
  );
}

// How many of the tenant's own uploaded images an apply would replace. Those are deleted by the
// next save (irreversible once saved), which is why the manager is asked first. Catalogue images,
// not-yet-saved `tmp/` uploads and the images the apply keeps are not the tenant's saved uploads.
export function countTenantImagesReplacedByTemplate(
  layout: readonly HotsiteModuleResponse[],
  tenantId: string,
): number {
  const marker = `tenants/${tenantId}/`;
  return layout.flatMap(replacedImagePaths).filter((path) => path.includes(marker)).length;
}

export function contentOf(draft: HotsiteAdminContentResponse): HotsiteTemplateDraftContent {
  return { branding: draft.branding, layout: draft.layout, seo: draft.seo };
}

// The apply request carries the draft with its image fields as storage paths, exactly like a save:
// the draft holds resolved public URLs, which the backend would reject.
export function buildApplyRequest(
  draft: HotsiteAdminContentResponse,
  tenantId: string,
): ApplyHotsiteTemplateRequest {
  const { branding, layout, seo } = stripResolvedImageUrls(
    draft.branding,
    draft.layout,
    draft.seo,
    tenantId,
  );
  return { content: { branding, layout, seo } };
}

// Applying replaces the presentation (branding, layout, SEO) and nothing else of the draft.
export function applyTemplateResult(
  draft: HotsiteAdminContentResponse,
  result: ApplyHotsiteTemplateResponse,
): HotsiteAdminContentResponse {
  return { ...draft, ...result.content };
}

export interface TemplateUndoSnapshot {
  // The presentation held just before the apply — what Undo puts back.
  readonly before: HotsiteTemplateDraftContent;
  // The presentation the apply produced — what the draft must still equal for Undo to be lossless.
  readonly applied: HotsiteTemplateDraftContent;
}

export function undoSnapshotAfterApply(
  before: HotsiteAdminContentResponse,
  applied: HotsiteAdminContentResponse,
): TemplateUndoSnapshot {
  return { before: contentOf(before), applied: contentOf(applied) };
}

// Undo is lossless only while the draft is exactly what the apply produced; any edit made since
// would be discarded with it, so the manager is asked first.
export function shouldConfirmUndo(
  draft: HotsiteAdminContentResponse,
  snapshot: TemplateUndoSnapshot,
): boolean {
  return !isStructurallyEqual(contentOf(draft), snapshot.applied);
}

export function restoreUndoSnapshot(
  draft: HotsiteAdminContentResponse,
  snapshot: TemplateUndoSnapshot,
): HotsiteAdminContentResponse {
  return { ...draft, ...snapshot.before };
}

// Localized chip text for each capability token. An exhaustive Record, so a token added to the
// closed set in @ikaro/types fails the compile until it has copy.
export const TEMPLATE_CAPABILITY_LABEL_KEY: Readonly<Record<HotsiteTemplateCapability, string>> = {
  navigation: 'capabilities.navigation',
  'split-hero': 'capabilities.split-hero',
  'immersive-hero': 'capabilities.immersive-hero',
  'feature-card-services': 'capabilities.feature-card-services',
  'numbered-services': 'capabilities.numbered-services',
  'trust-grid': 'capabilities.trust-grid',
  'process-steps': 'capabilities.process-steps',
  collage: 'capabilities.collage',
  'image-statement': 'capabilities.image-statement',
  'immersive-statement': 'capabilities.immersive-statement',
  'technical-callout': 'capabilities.technical-callout',
  'editorial-quote': 'capabilities.editorial-quote',
  'icon-card-contact': 'capabilities.icon-card-contact',
  'lead-form': 'capabilities.lead-form',
  chatbot: 'capabilities.chatbot',
};

export const MAX_CAPABILITY_CHIPS = 4;
