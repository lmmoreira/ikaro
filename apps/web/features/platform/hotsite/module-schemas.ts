import { z } from 'zod';
import {
  ContentBlockModuleDataSchema,
  HotsiteCtaTargetSchema,
  NavigationModuleDataSchema,
  ServiceDetailPageSettingsSchema,
} from '@ikaro/types';
import type {
  AboutModuleData,
  BookingCtaModuleData,
  ChatbotModuleData,
  ContactModuleData,
  FooterModuleData,
  GalleryImage,
  GalleryModuleData,
  HeroModuleData,
  HotsiteModuleType,
  LeadFormModuleData,
  ServiceListModuleData,
  Testimonial,
  TestimonialsModuleData,
} from '@ikaro/types';

const CTA_TARGET = HotsiteCtaTargetSchema;

const SECTION_VARIANT = z.enum(['centered', 'left-aligned', 'immersive']);

// Independent mirror of the older modules in @ikaro/validation's hotsite-modules.ts (apps/web must
// never import that package). Every case in @ikaro/types/testing/hotsite-module-contract is run
// against both sets in their specs, so a rule changed in one and not the other fails a test.

// Mirrors HeroModuleData (packages/types/src/hotsite.ts) — keep in sync when that type changes.
export const HeroModuleDataSchema = z.object({
  variant: SECTION_VARIANT,
  title: z.string(),
  subtitle: z.string().optional(),
  eyebrow: z.string().optional(),
  backgroundImageUrl: z.string().nullable().optional(),
  backgroundImagePosition: z.enum(['left', 'center', 'right']).optional(),
  contentPositionX: z.enum(['left', 'center', 'right']).optional(),
  contentPositionY: z.enum(['top', 'center', 'bottom']).optional(),
  ctaLabel: z.string(),
  ctaTarget: CTA_TARGET,
  secondaryCtaLabel: z.string().optional(),
  secondaryCtaTarget: CTA_TARGET.optional(),
  rightPanel: z.enum(['none', 'image', 'brand-card']).optional(),
}) satisfies z.ZodType<HeroModuleData>;

// Mirrors ServiceListModuleData (packages/types/src/hotsite.ts) — keep in sync when that type changes.
export const ServiceListModuleDataSchema = z.object({
  title: z.string().optional(),
  eyebrow: z.string().optional(),
  showPrices: z.boolean(),
  showPoints: z.boolean(),
  layout: z.enum(['grid', 'list', 'numbered', 'feature-cards']),
  itemAction: z.enum(['details', 'booking', 'none']).optional(),
  itemCtaLabel: z.string().max(40).optional(),
  // A closed set (adding a field later is a new story), so unknown keys are rejected.
  detailPage: ServiceDetailPageSettingsSchema.optional(),
  cardColumns: z.union([z.literal(2), z.literal(3)]).optional(),
  cardTone: z.enum(['plain', 'tinted', 'ruled']).optional(),
}) satisfies z.ZodType<ServiceListModuleData>;

// Mirrors GalleryImage (packages/types/src/hotsite.ts) — keep in sync when that type changes.
const GalleryImageSchema = z.object({
  url: z.string(),
  caption: z.string().optional(),
  source: z.enum(['booking', 'upload']),
  bookingId: z.string().optional(),
  photoType: z.enum(['before', 'after']).optional(),
  width: z.number().optional(),
  height: z.number().optional(),
}) satisfies z.ZodType<GalleryImage>;

// Mirrors GalleryModuleData (packages/types/src/hotsite.ts) — keep in sync when that type changes.
export const GalleryModuleDataSchema = z.object({
  title: z.string().optional(),
  eyebrow: z.string().optional(),
  images: z.array(GalleryImageSchema),
  layout: z.enum(['grid', 'masonry', 'featured', 'portfolio']),
  maxVisible: z.number().int().min(1),
  featuredPosition: z.enum(['left', 'right']).optional(),
}) satisfies z.ZodType<GalleryModuleData>;

// Mirrors Testimonial (packages/types/src/hotsite.ts) — keep in sync when that type changes.
const TestimonialSchema = z.object({
  authorName: z.string(),
  text: z.string(),
  rating: z
    .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)])
    .optional(),
  avatarUrl: z.string().nullable().optional(),
}) satisfies z.ZodType<Testimonial>;

// Mirrors TestimonialsModuleData (packages/types/src/hotsite.ts) — keep in sync when that type changes.
export const TestimonialsModuleDataSchema = z.object({
  title: z.string().optional(),
  eyebrow: z.string().optional(),
  items: z.array(TestimonialSchema),
  layout: z.enum(['grid', 'carousel', 'editorial-quote']),
}) satisfies z.ZodType<TestimonialsModuleData>;

// Mirrors BookingCtaModuleData (packages/types/src/hotsite.ts) — keep in sync when that type changes.
export const BookingCtaModuleDataSchema = z.object({
  variant: SECTION_VARIANT.optional(),
  title: z.string(),
  subtitle: z.string().optional(),
  eyebrow: z.string().optional(),
  ctaLabel: z.string(),
  backgroundImageUrl: z.string().nullable().optional(),
  backgroundImagePosition: z.enum(['left', 'center', 'right']).optional(),
  carouselDays: z.number().int().min(1).max(90).optional(),
  datePickerType: z.enum(['carousel', 'calendar']).optional(),
  bgStyle: z.enum(['primary', 'background']).optional(),
  rightPanel: z.enum(['none', 'brand-card']).optional(),
  contentPositionX: z.enum(['left', 'center', 'right']).optional(),
  contentPositionY: z.enum(['top', 'center', 'bottom']).optional(),
}) satisfies z.ZodType<BookingCtaModuleData>;

// Mirrors AboutModuleData (packages/types/src/hotsite.ts) — keep in sync when that type changes.
export const AboutModuleDataSchema = z.object({
  title: z.string(),
  body: z.string(),
  eyebrow: z.string().optional(),
  imageUrl: z.string().nullable().optional(),
  imagePosition: z.enum(['left', 'right']),
  variant: z.enum(['split', 'editorial', 'bleed']).optional(),
}) satisfies z.ZodType<AboutModuleData>;

// Mirrors ContactModuleData (packages/types/src/hotsite.ts) — keep in sync when that type changes.
export const ContactModuleDataSchema = z.object({
  title: z.string().optional(),
  eyebrow: z.string().optional(),
  showAddress: z.boolean(),
  showPhone: z.boolean(),
  showWhatsapp: z.boolean(),
  showEmail: z.boolean(),
  showMap: z.boolean(),
  showInstagram: z.boolean().optional(),
  showFacebook: z.boolean().optional(),
  displayStyle: z.enum(['list', 'icon-cards']).optional(),
  whatsappCtaLabel: z.string().optional(),
}) satisfies z.ZodType<ContactModuleData>;

// Mirrors FooterModuleData (packages/types/src/hotsite.ts) — keep in sync when that type changes.
export const FooterModuleDataSchema = z.object({
  tagline: z.string().optional(),
  copyrightNote: z.string().optional(),
  showWhatsapp: z.boolean().optional(),
}) satisfies z.ZodType<FooterModuleData>;

// Mirrors ChatbotModuleData (packages/types/src/hotsite.ts) — keep in sync when that type changes.
export const ChatbotModuleDataSchema = z.object({
  variant: z.enum(['bubble', 'inline']).optional(),
  accentColor: z.enum(['primary', 'secondary']).optional(),
  botName: z.string().optional(),
  welcomeMessage: z.string().optional(),
}) satisfies z.ZodType<ChatbotModuleData>;

// Mirrors LeadFormModuleData (packages/types/src/hotsite.ts) — keep in sync when that type changes.
export const LeadFormModuleDataSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  eyebrow: z.string().optional(),
  ctaLabel: z.string(),
  variant: SECTION_VARIANT.optional(),
  backgroundImageUrl: z.string().nullable().optional(),
  backgroundImagePosition: z.enum(['left', 'center', 'right']).optional(),
  bgStyle: z.enum(['primary', 'background']).optional(),
}) satisfies z.ZodType<LeadFormModuleData>;

// NAVIGATION and CONTENT_BLOCK are strict shapes defined once in @ikaro/types (hotsite-schemas.ts),
// shared with @ikaro/validation; they are re-exported here for the page model.
export { ContentBlockModuleDataSchema, NavigationModuleDataSchema };

const MODULE_DATA_SCHEMAS: Partial<Record<HotsiteModuleType, z.ZodType>> = {
  NAVIGATION: NavigationModuleDataSchema,
  CONTENT_BLOCK: ContentBlockModuleDataSchema,
  HERO: HeroModuleDataSchema,
  SERVICE_LIST: ServiceListModuleDataSchema,
  GALLERY: GalleryModuleDataSchema,
  TESTIMONIALS: TestimonialsModuleDataSchema,
  BOOKING_CTA: BookingCtaModuleDataSchema,
  ABOUT: AboutModuleDataSchema,
  CONTACT: ContactModuleDataSchema,
  FOOTER: FooterModuleDataSchema,
  CHATBOT: ChatbotModuleDataSchema,
  LEAD_FORM: LeadFormModuleDataSchema,
};

// Module types without a registered schema render unvalidated until their story (M12-S05+) adds one.
export function isValidModuleData(type: HotsiteModuleType, data: unknown): boolean {
  const schema = MODULE_DATA_SCHEMAS[type];
  return schema ? schema.safeParse(data).success : true;
}
