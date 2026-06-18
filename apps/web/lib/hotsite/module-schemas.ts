import { z } from 'zod';
import type {
  AboutModuleData,
  BookingCtaModuleData,
  ContactModuleData,
  FooterModuleData,
  GalleryImage,
  GalleryModuleData,
  HeroModuleData,
  HotsiteModuleType,
  ServiceListModuleData,
  Testimonial,
  TestimonialsModuleData,
} from '@ikaro/types';

const CTA_TARGET = z.enum([
  'booking-form',
  'service-list',
  'gallery',
  'testimonials',
  'about',
  'contact',
]);

// Mirrors HeroModuleData (packages/types/src/hotsite.ts) — keep in sync when that type changes.
export const HeroModuleDataSchema = z.object({
  variant: z.enum(['centered', 'left-aligned']),
  title: z.string(),
  subtitle: z.string().optional(),
  eyebrow: z.string().optional(),
  backgroundImageUrl: z.string().optional(),
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
  layout: z.enum(['grid', 'list']),
}) satisfies z.ZodType<ServiceListModuleData>;

// Mirrors GalleryImage (packages/types/src/hotsite.ts) — keep in sync when that type changes.
const GalleryImageSchema = z.object({
  url: z.string(),
  caption: z.string().optional(),
  source: z.enum(['booking', 'upload']),
  bookingId: z.string().optional(),
  photoType: z.enum(['before', 'after']).optional(),
}) satisfies z.ZodType<GalleryImage>;

// Mirrors GalleryModuleData (packages/types/src/hotsite.ts) — keep in sync when that type changes.
export const GalleryModuleDataSchema = z.object({
  title: z.string().optional(),
  eyebrow: z.string().optional(),
  images: z.array(GalleryImageSchema),
  layout: z.enum(['grid', 'masonry']),
  maxVisible: z.number().int().min(1),
}) satisfies z.ZodType<GalleryModuleData>;

// Mirrors Testimonial (packages/types/src/hotsite.ts) — keep in sync when that type changes.
const TestimonialSchema = z.object({
  authorName: z.string(),
  text: z.string(),
  rating: z
    .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)])
    .optional(),
  avatarUrl: z.string().optional(),
}) satisfies z.ZodType<Testimonial>;

// Mirrors TestimonialsModuleData (packages/types/src/hotsite.ts) — keep in sync when that type changes.
export const TestimonialsModuleDataSchema = z.object({
  title: z.string().optional(),
  eyebrow: z.string().optional(),
  items: z.array(TestimonialSchema),
  layout: z.enum(['grid', 'carousel']),
}) satisfies z.ZodType<TestimonialsModuleData>;

// Mirrors BookingCtaModuleData (packages/types/src/hotsite.ts) — keep in sync when that type changes.
export const BookingCtaModuleDataSchema = z.object({
  variant: z.enum(['centered', 'left-aligned']).optional(),
  title: z.string(),
  subtitle: z.string().optional(),
  eyebrow: z.string().optional(),
  ctaLabel: z.string(),
  backgroundImageUrl: z.string().optional(),
  carouselDays: z.number().int().min(1).max(90).optional(),
  bgStyle: z.enum(['primary', 'background']).optional(),
  rightPanel: z.enum(['none', 'brand-card']).optional(),
}) satisfies z.ZodType<BookingCtaModuleData>;

// Mirrors AboutModuleData (packages/types/src/hotsite.ts) — keep in sync when that type changes.
export const AboutModuleDataSchema = z.object({
  title: z.string(),
  body: z.string(),
  eyebrow: z.string().optional(),
  imageUrl: z.string().optional(),
  imagePosition: z.enum(['left', 'right']),
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

const MODULE_DATA_SCHEMAS: Partial<Record<HotsiteModuleType, z.ZodType>> = {
  HERO: HeroModuleDataSchema,
  SERVICE_LIST: ServiceListModuleDataSchema,
  GALLERY: GalleryModuleDataSchema,
  TESTIMONIALS: TestimonialsModuleDataSchema,
  BOOKING_CTA: BookingCtaModuleDataSchema,
  ABOUT: AboutModuleDataSchema,
  CONTACT: ContactModuleDataSchema,
  FOOTER: FooterModuleDataSchema,
};

// Module types without a registered schema render unvalidated until their story (M12-S05+) adds one.
export function isValidModuleData(type: HotsiteModuleType, data: unknown): boolean {
  const schema = MODULE_DATA_SCHEMAS[type];
  return schema ? schema.safeParse(data).success : true;
}
