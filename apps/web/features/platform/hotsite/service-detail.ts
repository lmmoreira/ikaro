import type {
  FooterModuleData,
  HotsiteManifestResponse,
  HotsiteServiceDetailResponse,
  ServiceDetailPageSettings,
} from '@ikaro/types';
import { FooterModuleDataSchema, ServiceListModuleDataSchema } from './module-schemas';

// What a service's public page looks like when the SERVICE_LIST module sets no `detailPage` (or the
// hotsite has no SERVICE_LIST at all — the pages stay reachable by URL, just not linked).
export const SERVICE_DETAIL_PAGE_DEFAULTS: ServiceDetailPageSettings = {
  heroStyle: 'cover',
  galleryLayout: 'grid',
  showPrice: true,
  showDuration: true,
  showLoyaltyPoints: true,
};

// The look of every service page, configured on the (singleton) SERVICE_LIST module. A disabled
// module still carries its settings — the manager only turned its section off on the home page —
// and an invalid one falls back to the defaults rather than breaking a public page.
export function resolveServiceDetailSettings(
  manifest: Pick<HotsiteManifestResponse, 'layout'>,
): ServiceDetailPageSettings {
  const serviceList = manifest.layout.find((module) => module.type === 'SERVICE_LIST');
  const parsed = ServiceListModuleDataSchema.safeParse(serviceList?.data);
  return (parsed.success ? parsed.data.detailPage : undefined) ?? SERVICE_DETAIL_PAGE_DEFAULTS;
}

// The footer the service page renders, or null when the hotsite has no enabled FOOTER module.
export function resolveServiceDetailFooter(
  manifest: Pick<HotsiteManifestResponse, 'layout'>,
): FooterModuleData | null {
  const footer = manifest.layout.find((module) => module.type === 'FOOTER' && module.enabled);
  if (!footer) return null;
  const parsed = FooterModuleDataSchema.safeParse(footer.data);
  return parsed.success ? parsed.data : null;
}

const META_DESCRIPTION_MAX = 160;

// The search/social description of a service page: the short description when there is one, else
// the start of the long Markdown description with its formatting marks removed. undefined lets the
// tenant's own SEO description stand in.
export function resolveServiceMetaDescription(
  service: Pick<HotsiteServiceDetailResponse, 'description' | 'profile'>,
): string | undefined {
  if (service.description) return service.description;
  const plain = (service.profile.longDescription ?? '')
    .replaceAll(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replaceAll(/[*_#>`~-]+/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim();
  if (plain.length === 0) return undefined;
  return plain.length <= META_DESCRIPTION_MAX
    ? plain
    : `${plain.slice(0, META_DESCRIPTION_MAX - 1).trimEnd()}…`;
}
