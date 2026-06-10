import type { HotsiteModuleType } from './enums';
import type { TenantInfoResponse } from './tenant.dto';

export type { HotsiteModuleType };

// ─── Module data contracts (docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md §4) ──────

export interface HeroModuleData {
  variant: 'centered' | 'left-aligned';
  title: string;
  subtitle?: string;
  backgroundImageUrl?: string;
  ctaLabel: string;
  ctaTarget: 'booking' | 'service-list';
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
  title: string;
  subtitle?: string;
  ctaLabel: string;
  backgroundImageUrl?: string;
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
  socialLinks?: {
    instagram?: string;
    facebook?: string;
    whatsapp?: string;
  };
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

export interface HotsiteResponse {
  branding: HotsiteBrandingResponse;
  layout: HotsiteModuleResponse[];
  isPublished: boolean;
}

export interface HotsiteManifestResponse extends HotsiteResponse {
  tenant: TenantInfoResponse;
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
