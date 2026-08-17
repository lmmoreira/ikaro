import type { HotsiteModuleType } from './enums';
import type { Money } from './money';
import type { TenantInfoResponse } from './tenant.dto';

export type { HotsiteModuleType };

// ─── Module data contracts (docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md §4) ──────

// Shared by HeroModuleData/BookingCtaModuleData's backgroundImagePosition, contentPositionX, and
// contentPositionY fields — a single source of truth for this repeated union shape rather than
// spelling it out at every field (SonarCloud S4323 precedent, M18-S05).
export type HorizontalPosition = 'left' | 'center' | 'right';
export type VerticalPosition = 'top' | 'center' | 'bottom';

export interface HeroModuleData {
  variant: 'centered' | 'left-aligned';
  title: string;
  subtitle?: string;
  eyebrow?: string;
  // Nullable, not just optional: HotsiteImageUrlResolver (backend) and
  // stripResolvedImageUrls/mapHotsiteImageFields (web) all pass an explicit `null` through
  // unchanged rather than normalizing it — a module saved via a direct API write (not the
  // config panel, which only ever writes '' or a real path) can legitimately have this as
  // literal `null` on read.
  backgroundImageUrl?: string | null;
  // Horizontal focal-point preset for backgroundImageUrl's object-position — the crop axis that
  // loses content when the container goes from a wide desktop shape to a taller mobile one is
  // horizontal, not vertical (M18-S04).
  backgroundImagePosition?: HorizontalPosition;
  // Content-block anchor, independent of backgroundImagePosition (which only moves the image's
  // focal point). Both default to 'center', a no-op against this module's pre-M18-S05 hardcoded
  // centering — absent/undefined renders identically to before this field existed. contentPositionX
  // only has a rendering effect when variant === 'centered' (M18-S05).
  contentPositionX?: HorizontalPosition;
  contentPositionY?: VerticalPosition;
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
  width?: number;
  height?: number;
}

export interface GalleryModuleData {
  title?: string;
  eyebrow?: string;
  images: GalleryImage[];
  layout: 'grid' | 'masonry' | 'featured';
  maxVisible: number;
  /** Only meaningful when layout === 'featured' — which side the large tile (images[0]) renders on. Default 'left'. */
  featuredPosition?: 'left' | 'right';
}

export interface Testimonial {
  authorName: string;
  text: string;
  rating?: 1 | 2 | 3 | 4 | 5;
  // Nullable — see HeroModuleData.backgroundImageUrl's comment above for why.
  avatarUrl?: string | null;
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
  // Nullable — see HeroModuleData.backgroundImageUrl's comment above for why.
  backgroundImageUrl?: string | null;
  // Same field/default/rendering rule as HeroModuleData.backgroundImagePosition — M18-S05
  // follow-up, applying the M18-S04 responsive-crop treatment to this module too.
  backgroundImagePosition?: HorizontalPosition;
  carouselDays?: number;
  datePickerType?: 'carousel' | 'calendar';
  bgStyle?: 'primary' | 'background';
  rightPanel?: 'none' | 'brand-card';
  // See HeroModuleData.contentPositionX/Y's comment above — same field, same default, same
  // variant-scoping rule, applied to this module (M18-S05).
  contentPositionX?: HorizontalPosition;
  contentPositionY?: VerticalPosition;
}

export interface AboutModuleData {
  title: string;
  body: string;
  eyebrow?: string;
  // Nullable — see HeroModuleData.backgroundImageUrl's comment above for why.
  imageUrl?: string | null;
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

// Only fields rendered verbatim to every visitor — see docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md
// § CHATBOT for why knowledgeText and the volume/cost caps are deliberately excluded here and
// fetched separately, never shipped into the cached public manifest.
export interface ChatbotModuleData {
  variant?: 'bubble' | 'inline';
  accentColor?: 'primary' | 'secondary';
  botName?: string;
  welcomeMessage?: string;
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
  ogImageUrl: string;
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

export interface HotsiteBookingSettingsResponse {
  maxBookingAdvanceDays: number;
}

export interface HotsiteManifestResponse extends HotsiteResponse {
  tenant: TenantInfoResponse;
  business: HotsiteBusinessInfoResponse;
  localization: HotsiteLocalizationResponse;
  // Optional, not required: this is a shared @ikaro/types response contract — a required field
  // added here would be a breaking change for any producer/consumer/cached response still on the
  // prior shape (see .coderabbit.yaml's packages/** path instructions).
  booking?: HotsiteBookingSettingsResponse;
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

// Groups an uploaded hotsite asset by what it's for; also encoded into the staging path so
// promotion can rebuild the permanent path without a second lookup. Single source of truth for
// apps/web (SingleImageUploadField.tsx, tenant-settings.ts) — the backend and BFF each keep their
// own Zod enum in sync separately (packages/validation doesn't re-export this, since those are
// runtime validators, not just a type).
export type HotsiteImagePurpose =
  'branding' | 'hero' | 'gallery' | 'about' | 'booking-cta' | 'testimonials' | 'seo-og-image';

export interface GenerateHotsiteImageSignedUrlResponse {
  signedUrl: string;
  filePath: string;
  expiresAt: string;
}

export interface GenerateHotsiteImageReadSignedUrlResponse {
  signedUrl: string;
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

// ─── Chatbot widget (Public — UC-033, UC-034, M19-S09) ─────────────────────────

export interface HotsiteChatbotStatusResponse {
  available: boolean;
}

export interface HotsiteChatbotMessageResponse {
  sessionId: string;
  reply: string;
}
