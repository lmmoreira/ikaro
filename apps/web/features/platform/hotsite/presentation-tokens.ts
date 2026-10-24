import type {
  HotsiteBrandingResponse,
  HotsiteModulePresentation,
  HotsiteModuleResponse,
} from '@ikaro/types';
import { deriveOverlayTextTokens, deriveSectionTokens } from './apply-branding';
import { isValidPresentation } from './presentation-schema';
import { sectionTints } from './section-tints';
import type {
  HotsiteModuleParsed,
  HotsiteModuleRenderPlanItem,
  HotsiteSectionBgVariant,
} from './render-plan.types';

function resolveSurfaceColor(
  branding: HotsiteBrandingResponse,
  presentation: HotsiteModulePresentation | undefined,
  bgVariant: HotsiteSectionBgVariant,
): string {
  switch (presentation?.surface) {
    case 'primary':
      return branding.primaryColor;
    case 'secondary':
      return branding.secondaryColor;
    case 'background':
      return branding.backgroundColor;
    case 'custom':
      return presentation.customColor ?? branding.backgroundColor;
    default:
      return bgVariant === 'alt' ? branding.secondaryColor : branding.backgroundColor;
  }
}

function defaultModuleColor(
  layoutModule: HotsiteModuleResponse,
  branding: HotsiteBrandingResponse,
  bgVariant: HotsiteSectionBgVariant,
): string {
  if (layoutModule.type === 'HERO') {
    return branding.heroBgStyle === 'background' ? branding.backgroundColor : branding.primaryColor;
  }
  if (layoutModule.type === 'BOOKING_CTA' || layoutModule.type === 'LEAD_FORM') {
    return layoutModule.data.bgStyle === 'background'
      ? branding.backgroundColor
      : branding.primaryColor;
  }
  return resolveSurfaceColor(branding, undefined, bgVariant);
}

export function resolveItemTints(
  layoutModule: HotsiteModuleResponse,
  parsed: HotsiteModuleParsed,
  branding: HotsiteBrandingResponse | undefined,
  bgVariant: HotsiteSectionBgVariant,
): Pick<HotsiteModuleRenderPlanItem, 'tints'> {
  if (!branding) return {};
  const wantsTints =
    (parsed.type === 'SERVICE_LIST' && parsed.data.cardTone === 'tinted') ||
    (parsed.type === 'CONTENT_BLOCK' &&
      parsed.data.variant === 'trust-grid' &&
      parsed.data.appearance === 'tiles');
  if (!wantsTints) return {};
  const presentation = isValidPresentation(layoutModule.presentation)
    ? layoutModule.presentation
    : undefined;
  return { tints: sectionTints(branding, resolveSurfaceColor(branding, presentation, bgVariant)) };
}

function contentAnchors(
  data: Record<string, unknown>,
): ['left' | 'center' | 'right', 'top' | 'center' | 'bottom'] {
  const x = data.contentPositionX ?? data.align;
  const y = data.contentPositionY;
  return [
    x === 'left' || x === 'right' ? x : 'center',
    y === 'top' || y === 'bottom' ? y : 'center',
  ];
}

// The module's own `presentation` (an invalid one is ignored) and, for a section that sets a
// surface, the scoped contrast tokens derived from it with the tenant's branding.
export function resolveItemPresentation(
  layoutModule: HotsiteModuleResponse,
  branding: HotsiteBrandingResponse | undefined,
  bgVariant: HotsiteSectionBgVariant,
): Pick<HotsiteModuleRenderPlanItem, 'presentation' | 'sectionTokens'> {
  if (!isValidPresentation(layoutModule.presentation)) return {};
  const { presentation } = layoutModule;
  if (!branding) return { presentation };
  const defaultColor = defaultModuleColor(layoutModule, branding, bgVariant);
  const surface = presentation.surface ?? 'custom';
  const ownPhoto =
    'backgroundImageUrl' in layoutModule.data && !!layoutModule.data.backgroundImageUrl;
  if (
    presentation.overlay &&
    presentation.overlay.type !== 'none' &&
    (presentation.background?.imageUrl || ownPhoto)
  ) {
    const [x, y] = contentAnchors(layoutModule.data);
    return {
      presentation,
      sectionTokens: deriveOverlayTextTokens(
        branding,
        surface,
        presentation.overlay,
        presentation.surface ? presentation.customColor : defaultColor,
        x,
        y,
      ),
    };
  }
  if (!presentation.surface) return { presentation };
  return {
    presentation,
    sectionTokens: deriveSectionTokens(branding, presentation.surface, presentation.customColor),
  };
}
