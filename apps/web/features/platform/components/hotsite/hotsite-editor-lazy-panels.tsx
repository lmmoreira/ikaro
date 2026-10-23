import dynamic from 'next/dynamic';
import type { HotsiteModuleType } from '@ikaro/types';
import type { ModuleConfigPanelProps } from './modules/module-config-panel.types';

// Extracted from HotsiteEditor (TD37-S5A) — each panel is lazy-loaded so a manager who never
// opens "Configurar" on a given module never downloads that panel's JS — the same code-splitting
// benefit a real route would give, without needing to lift `draft` into a layout.tsx/Context.
// Not `Partial<Record<...>>` — a non-partial Record makes `tsc` reject this literal unless every
// HotsiteModuleType has an entry, catching a missing panel (e.g. the CHATBOT entry this branch's
// main-merge conflict resolution restored by hand) at compile time instead of relying on a test.
export const MODULE_CONFIG_PANELS: Record<
  HotsiteModuleType,
  React.ComponentType<ModuleConfigPanelProps>
> = {
  // NAVIGATION and CONTENT_BLOCK get their real panels later; until then they share a
  // labelled placeholder so the non-partial Record compiles (see PlaceholderConfigPanel).
  NAVIGATION: dynamic(
    () => import('./modules/PlaceholderConfigPanel').then((m) => m.PlaceholderConfigPanel),
    { ssr: false },
  ),
  CONTENT_BLOCK: dynamic(
    () => import('./modules/PlaceholderConfigPanel').then((m) => m.PlaceholderConfigPanel),
    { ssr: false },
  ),
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
  CHATBOT: dynamic(() => import('./modules/ChatbotConfigPanel').then((m) => m.ChatbotConfigPanel), {
    ssr: false,
  }),
  // Real field-editing form, shipped M20-S08 (LeadFormConfigPanel.tsx) — teaser fields,
  // audienceMode, and the inline question builder.
  LEAD_FORM: dynamic(
    () => import('./modules/LeadFormConfigPanel').then((m) => m.LeadFormConfigPanel),
    { ssr: false },
  ),
};

// Lazy-loaded for the same reason as the module config panels above: the M12 public hotsite
// render components it pulls in cost zero client JS on the public page (Server Components there),
// but become client-hydrated code once imported into this 'use client' tree — so that cost should
// only be paid by managers who actually click "Preview," not every visit to /dashboard/hotsite.
export const HotsitePreview = dynamic(
  () => import('./HotsitePreview').then((m) => m.HotsitePreview),
  { ssr: false },
);

// The branded draft frame (no publish chrome) the visual editor embeds. Lazy for the same reason
// as HotsitePreview above: the public module render components become client JS once imported
// here, so only a manager who opens the editor pays for them.
export const HotsitePreviewCanvas = dynamic(
  () => import('./HotsitePreviewCanvas').then((m) => m.HotsitePreviewCanvas),
  { ssr: false },
);
