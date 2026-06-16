import type { HotsiteModuleType } from './enums';
import type { Money } from './money';
import type { TenantInfoResponse } from './tenant.dto';

export type { HotsiteModuleType };

// ─── Module data contracts (docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md §4) ──────

export interface HeroModuleData {
  variant: 'centered' | 'left-aligned';
  title: string;
  subtitle?: string;
  backgroundImageUrl?: string;
  ctaLabel: string;
  ctaTarget: 'booking-form' | 'service-list' | 'gallery' | 'testimonials' | 'about' | 'contact';
}

export interface ServiceListModuleData {
  title?: string;
  showPrices: boolean;
  showPoints: boolean;
  layout: 'grid' | 'list';
}

export interface GalleryImage {
  url: string;
  caption?: string;
  source: 'booking' | 'upload';
  bookingId?: string;
  photoType?: 'before' | 'after';
}

export interface GalleryModuleData {
  title?: string;
  images: GalleryImage[];
  layout: 'grid' | 'masonry';
  maxVisible: number;
}

export interface Testimonial {
  authorName: string;
  text: string;
  rating?: 1 | 2 | 3 | 4 | 5;
  avatarUrl?: string;
}

export interface TestimonialsModuleData {
  title?: string;
  items: Testimonial[];
  layout: 'grid' | 'carousel';
}

export interface BookingCtaModuleData {
  variant?: 'centered' | 'left-aligned';
  title: string;
  subtitle?: string;
  ctaLabel: string;
  backgroundImageUrl?: string;
  carouselDays?: number;
}

export interface AboutModuleData {
  title: string;
  body: string;
  imageUrl?: string;
  imagePosition: 'left' | 'right';
}

export interface ContactModuleData {
  title?: string;
  showAddress: boolean;
  showPhone: boolean;
  showWhatsapp: boolean;
  showEmail: boolean;
  showMap: boolean;
}

// ─── BFF response types ───────────────────────────────────────────────────────

export interface HotsiteModuleResponse {
  type: HotsiteModuleType;
  enabled: boolean;
  data: Record<string, unknown>;
}

export interface HotsiteBrandingResponse {
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  textColor: string;
  headingFontFamily: string;
  bodyFontFamily: string;
  logoUrl: string;
  borderRadius: 'sharp' | 'rounded' | 'pill';
  buttonStyle: 'filled' | 'outline' | 'ghost';
  spacing: 'compact' | 'comfortable' | 'spacious';
  shadowStyle: 'none' | 'subtle' | 'strong';
  buttonBackgroundColor?: string;
  buttonTextColor?: string;
}

export interface HotsiteSeoResponse {
  title: string | null;
  description: string | null;
}

export interface HotsiteResponse {
  branding: HotsiteBrandingResponse;
  layout: HotsiteModuleResponse[];
  seo: HotsiteSeoResponse;
  isPublished: boolean;
}

export interface HotsiteBusinessInfoAddress {
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
}

export interface HotsiteBusinessInfoSocialLinks {
  whatsapp: string | null;
  instagram: string | null;
  facebook: string | null;
}

export interface HotsiteBusinessInfoResponse {
  phone: string | null;
  email: string | null;
  address: HotsiteBusinessInfoAddress | null;
  socialLinks: HotsiteBusinessInfoSocialLinks | null;
}

export interface HotsiteLocalizationResponse {
  language: string;
}

export interface HotsiteManifestResponse extends HotsiteResponse {
  tenant: TenantInfoResponse;
  business: HotsiteBusinessInfoResponse;
  localization: HotsiteLocalizationResponse;
}

export interface HotsiteAdminContentResponse extends HotsiteResponse {
  updatedAt: string;
}

export interface PublishHotsiteResponse {
  isPublished: boolean;
}

export interface UnpublishHotsiteResponse {
  isPublished: boolean;
}

export interface GenerateHotsiteImageSignedUrlResponse {
  signedUrl: string;
  filePath: string;
  expiresAt: string;
}

export interface FeatureBookingPhotoResponse {
  filePath: string;
  url: string;
  photoType: 'before' | 'after';
}

// ─── Public service list (consumed by SERVICE_LIST module + future hotsite modules) ──

export interface HotsiteServiceResponse {
  id: string;
  name: string;
  description: string | null;
  price: Money;
  durationMinutes: number;
  loyaltyPointsValue: number;
  requiresPickupAddress: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface HotsiteServiceListResponse {
  items: HotsiteServiceResponse[];
}

// ─── Published hotsites listing (sitemap.xml — M12-S09) ───────────────────────

export interface HotsiteSitemapEntryResponse {
  slug: string;
  updatedAt: string;
}

export interface HotsiteSitemapEntryListResponse {
  items: HotsiteSitemapEntryResponse[];
}
