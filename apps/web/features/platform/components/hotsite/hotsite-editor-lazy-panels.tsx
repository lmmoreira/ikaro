import dynamic from 'next/dynamic';
import type { HotsiteModuleType } from '@ikaro/types';
import type { ModuleConfigPanelProps } from './modules/module-config-panel.types';

// Extracted from HotsiteEditor (TD37-S5A) — each panel is lazy-loaded so a manager who never
// opens "Configurar" on a given module never downloads that panel's JS — the same code-splitting
// benefit a real route would give, without needing to lift `draft` into a layout.tsx/Context.
// Partial, not exhaustive: CHATBOT (M19-S11) has no config panel yet — its drill-down entry ships
// in M19-S12, same reasoning as default-layout.ts's DEFAULT_MODULE_DATA.
export const MODULE_CONFIG_PANELS: Partial<
  Record<HotsiteModuleType, React.ComponentType<ModuleConfigPanelProps>>
> = {
  HERO: dynamic(() => import('./modules/HeroConfigPanel').then((m) => m.HeroConfigPanel), {
    ssr: false,
  }),
  SERVICE_LIST: dynamic(
    () => import('./modules/ServiceListConfigPanel').then((m) => m.ServiceListConfigPanel),
    { ssr: false },
  ),
  GALLERY: dynamic(() => import('./modules/GalleryConfigPanel').then((m) => m.GalleryConfigPanel), {
    ssr: false,
  }),
  TESTIMONIALS: dynamic(
    () => import('./modules/TestimonialsConfigPanel').then((m) => m.TestimonialsConfigPanel),
    { ssr: false },
  ),
  BOOKING_CTA: dynamic(
    () => import('./modules/BookingCtaConfigPanel').then((m) => m.BookingCtaConfigPanel),
    { ssr: false },
  ),
  ABOUT: dynamic(() => import('./modules/AboutConfigPanel').then((m) => m.AboutConfigPanel), {
    ssr: false,
  }),
  CONTACT: dynamic(() => import('./modules/ContactConfigPanel').then((m) => m.ContactConfigPanel), {
    ssr: false,
  }),
  FOOTER: dynamic(() => import('./modules/FooterConfigPanel').then((m) => m.FooterConfigPanel), {
    ssr: false,
  }),
};

// Lazy-loaded for the same reason as the module config panels above: the M12 public hotsite
// render components it pulls in cost zero client JS on the public page (Server Components there),
// but become client-hydrated code once imported into this 'use client' tree — so that cost should
// only be paid by managers who actually click "Preview," not every visit to /dashboard/hotsite.
export const HotsitePreview = dynamic(
  () => import('./HotsitePreview').then((m) => m.HotsitePreview),
  { ssr: false },
);
