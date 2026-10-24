import type {
  AboutModuleData,
  BookingCtaModuleData,
  ChatbotModuleData,
  ContactModuleData,
  ContentBlockModuleData,
  FooterModuleData,
  GalleryModuleData,
  HeroModuleData,
  HotsiteModulePresentation,
  LeadFormModuleData,
  NavigationModuleData,
  ServiceListModuleData,
  TestimonialsModuleData,
} from '@ikaro/types';
import type { SectionTokens } from './apply-branding';
import type { SectionTint } from './section-tints';

// Shared by page-model.ts and presentation-tokens.ts, which would otherwise import each other.
export type HotsiteSectionBgVariant = 'default' | 'alt';

export type HotsiteModuleParsed =
  | { readonly type: 'NAVIGATION'; readonly data: NavigationModuleData }
  | { readonly type: 'CONTENT_BLOCK'; readonly data: ContentBlockModuleData }
  | { readonly type: 'HERO'; readonly data: HeroModuleData }
  | { readonly type: 'SERVICE_LIST'; readonly data: ServiceListModuleData }
  | { readonly type: 'GALLERY'; readonly data: GalleryModuleData }
  | { readonly type: 'TESTIMONIALS'; readonly data: TestimonialsModuleData }
  | { readonly type: 'BOOKING_CTA'; readonly data: BookingCtaModuleData }
  | { readonly type: 'ABOUT'; readonly data: AboutModuleData }
  | { readonly type: 'CONTACT'; readonly data: ContactModuleData }
  | { readonly type: 'FOOTER'; readonly data: FooterModuleData }
  | { readonly type: 'CHATBOT'; readonly data: ChatbotModuleData }
  | { readonly type: 'LEAD_FORM'; readonly data: LeadFormModuleData };

export interface HotsiteModuleRenderPlanItem {
  readonly parsed: HotsiteModuleParsed;
  readonly bgVariant: HotsiteSectionBgVariant;
  // The module's own section presentation, only when it parses. An invalid one is ignored — the
  // section renders with its defaults — and never removes the module the way malformed `data` does
  // (a stored manifest can predate a tightened rule; a cosmetic field must not blank a section).
  readonly presentation?: HotsiteModulePresentation;
  // The scoped contrast tokens for `presentation.surface`, present only when the module sets one
  // and the plan was built with the tenant's branding. HotsiteSectionShell puts them on the
  // section element; nothing else reads them.
  readonly sectionTokens?: SectionTokens;
  readonly tints?: readonly [SectionTint, SectionTint, SectionTint];
}
