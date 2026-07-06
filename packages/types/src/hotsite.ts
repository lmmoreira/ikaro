import type { HotsiteModuleType } from './enums';
import type { Money } from './money';
import type { TenantInfoResponse } from './tenant.dto';

export type { HotsiteModuleType };

// ─── Module data contracts (docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md §4) ──────

export interface HeroModuleData {
  variant: 'centered' | 'left-aligned';
  title: string;
  subtitle?: string;
  eyebrow?: string;
  backgroundImageUrl?: string;
  ctaLabel: string;
  ctaTarget: 'booking-form' | 'service-list' | 'gallery' | 'testimonials' | 'about' | 'contact';
  secondaryCtaLabel?: string;
  secondaryCtaTarget?:
    'booking-form' | 'service-list' | 'gallery' | 'testimonials' | 'about' | 'contact';
  rightPanel?: 'none' | 'image' | 'brand-card';
}

export interface ServiceListModuleData {
  title?: string;
  eyebrow?: string;
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
  eyebrow?: string;
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
  eyebrow?: string;
  items: Testimonial[];
  layout: 'grid' | 'carousel';
}

export interface BookingCtaModuleData {
  variant?: 'centered' | 'left-aligned';
  title: string;
  subtitle?: string;
  eyebrow?: string;
  ctaLabel: string;
  backgroundImageUrl?: string;
  carouselDays?: number;
  bgStyle?: 'primary' | 'background';
  rightPanel?: 'none' | 'brand-card';
}

export interface AboutModuleData {
  title: string;
  body: string;
  eyebrow?: string;
  imageUrl?: string;
  imagePosition: 'left' | 'right';
}

export interface FooterModuleData {
  tagline?: string;
  copyrightNote?: string;
  showWhatsapp?: boolean;
}

export interface ContactModuleData {
  title?: string;
  eyebrow?: string;
  showAddress: boolean;
  showPhone: boolean;
  showWhatsapp: boolean;
  showEmail: boolean;
  showMap: boolean;
  showInstagram?: boolean;
  showFacebook?: boolean;
  displayStyle?: 'list' | 'icon-cards';
  whatsappCtaLabel?: string;
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
  // Visual rhythm
  heroBgStyle?: 'primary' | 'background';
  alternateSectionBg?: boolean;
  dividerStyle?: 'none' | 'gradient' | 'solid';
  // Brand identity (used by brand-card rightPanel in hero/booking-cta)
  brandName?: string;
  brandTagline?: string;
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
  neighborhood?: string;
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

export interface HotsiteAddressSpec {
  postalLabel: string;
  postalPlaceholder: string;
  stateLabel: string;
  requireNeighborhood: boolean;
  neighborhoodLabel: string | null;
  streetLabel: string;
  numberLabel: string;
  complementLabel: string;
  cityLabel: string;
  lookupService: 'viacep' | 'none';
}

export interface HotsiteLocalizationResponse {
  language: string;
  currency: string;
  timezone: string;
  phonePrefix: string;
  dateFormat: string;
  timeFormat: '24h' | '12h';
  numberFormat: string;
  firstDayOfWeek: 0 | 1;
  address: HotsiteAddressSpec;
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
