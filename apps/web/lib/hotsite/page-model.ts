import type {
  HotsiteManifestResponse,
  HotsiteModuleResponse,
  HotsiteModuleType,
} from '@ikaro/types';
import { isValidModuleData } from './module-schemas';

export type HotsiteSectionBgVariant = 'default' | 'alt';

export interface HotsiteModuleRenderPlanItem {
  readonly module: HotsiteModuleResponse;
  readonly bgVariant: HotsiteSectionBgVariant;
}

const NON_ALTERNATING_TYPES: ReadonlySet<HotsiteModuleType> = new Set([
  'HERO',
  'BOOKING_CTA',
  'FOOTER',
]);

export function resolveHotsiteDisplayName(
  manifest: Pick<HotsiteManifestResponse, 'branding' | 'tenant'>,
): string {
  return manifest.branding.brandName ?? manifest.tenant.name;
}

export function buildHotsiteModuleRenderPlan(
  layout: ReadonlyArray<HotsiteModuleResponse>,
  alternateSectionBg: boolean,
): HotsiteModuleRenderPlanItem[] {
  const enabledModules = layout.filter(
    (module) => module.enabled && isValidModuleData(module.type, module.data),
  );

  let altIndex = 0;

  return enabledModules.map((module) => {
    const isAlt = alternateSectionBg && altIndex % 2 === 1;
    const participates = !NON_ALTERNATING_TYPES.has(module.type);
    altIndex++;

    return {
      module,
      bgVariant: participates && isAlt ? 'alt' : 'default',
    };
  });
}
