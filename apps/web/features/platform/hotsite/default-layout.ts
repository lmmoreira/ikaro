import type { HotsiteModuleResponse, HotsiteModuleType } from '@ikaro/types';

// Canonical order of every module type (packages/types/src/enums.ts), NAVIGATION first — the page
// chrome the layout editor pins above every section. Exported so manifest-schema.ts can validate a
// pasted layout's `type` values and its length against this same list, rather than re-declaring
// the 12 literals a second time.
export const MODULE_ORDER: readonly HotsiteModuleType[] = [
  'NAVIGATION',
  'HERO',
  'SERVICE_LIST',
  'GALLERY',
  'TESTIMONIALS',
  'BOOKING_CTA',
  'ABOUT',
  'CONTENT_BLOCK',
  'CONTACT',
  'FOOTER',
  'CHATBOT',
  'LEAD_FORM',
];

// Minimal data satisfying each module data type's required fields (module-schemas.ts) — used
// only to materialize a type not yet present in a tenant's saved layout (new tenants start with
// layout: [] — HotsiteConfig.create() on the backend). Kept in sync with module-schemas.ts.
export const DEFAULT_MODULE_DATA: Partial<Record<HotsiteModuleType, Record<string, unknown>>> = {
  HERO: { variant: 'centered', title: '', ctaLabel: '', ctaTarget: 'booking-form' },
  SERVICE_LIST: { showPrices: true, showPoints: true, layout: 'grid' },
  GALLERY: { images: [], layout: 'grid', maxVisible: 6 },
  TESTIMONIALS: { items: [], layout: 'grid' },
  BOOKING_CTA: { title: '', ctaLabel: '' },
  ABOUT: { title: '', body: '', imagePosition: 'left' },
  CONTACT: {
    showAddress: true,
    showPhone: true,
    showWhatsapp: true,
    showEmail: true,
    showMap: true,
  },
  NAVIGATION: { items: [] },
  CONTENT_BLOCK: { variant: 'image-statement', title: '' },
  FOOTER: {},
  // Every ChatbotModuleData field is optional (packages/types/src/hotsite.ts) — {} is already a
  // minimal valid value, unlike every other type above.
  CHATBOT: {},
  // LeadFormModuleData has two required fields (title, ctaLabel), same as BookingCtaModuleData —
  // {} would fail LeadFormModuleDataSchema validation, unlike CHATBOT above.
  LEAD_FORM: { title: '', ctaLabel: '' },
};

// Adds any module type missing from `existing` (disabled, with minimal default data) — never
// reorders what's already there, so a tenant's saved custom order is preserved. Ensures
// LayoutTab always has a row for every module type regardless of what was saved. NAVIGATION is
// page chrome the backend requires first, so a missing one goes in front; the rest are appended.
export function materializeLayout(
  existing: readonly HotsiteModuleResponse[],
): HotsiteModuleResponse[] {
  const existingTypes = new Set(existing.map((module) => module.type));
  const missing = MODULE_ORDER.filter((type) => !existingTypes.has(type)).map(
    (type): HotsiteModuleResponse => ({
      type,
      enabled: false,
      data: DEFAULT_MODULE_DATA[type] ?? {},
    }),
  );
  const pinned = missing.filter((module) => module.type === 'NAVIGATION');
  const appended = missing.filter((module) => module.type !== 'NAVIGATION');
  return [...pinned, ...existing, ...appended];
}
