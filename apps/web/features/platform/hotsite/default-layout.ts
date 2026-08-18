import type { HotsiteModuleResponse, HotsiteModuleType } from '@ikaro/types';

// Canonical order for module types absent from a tenant's saved layout (packages/types/src/enums.ts).
// Exported so manifest-schema.ts can validate a pasted layout's `type` values against this same
// list, rather than re-declaring the 9 literals a second time.
export const MODULE_ORDER: readonly HotsiteModuleType[] = [
  'HERO',
  'SERVICE_LIST',
  'GALLERY',
  'TESTIMONIALS',
  'BOOKING_CTA',
  'ABOUT',
  'CONTACT',
  'FOOTER',
  'CHATBOT',
];

// Minimal data satisfying each module data type's required fields (module-schemas.ts) — used
// only to materialize a type not yet present in a tenant's saved layout (new tenants start with
// layout: [] — HotsiteConfig.create() on the backend). Kept in sync with module-schemas.ts.
const DEFAULT_MODULE_DATA: Partial<Record<HotsiteModuleType, Record<string, unknown>>> = {
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
  FOOTER: {},
  // Every ChatbotModuleData field is optional (packages/types/src/hotsite.ts) — {} is already a
  // minimal valid value, unlike every other type above.
  CHATBOT: {},
};

// Appends any module type missing from `existing` (disabled, with minimal default data) — never
// reorders what's already there, so a tenant's saved custom order is preserved. Ensures
// LayoutTab always has a row for all 9 module types regardless of what was actually saved.
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
  return [...existing, ...missing];
}
