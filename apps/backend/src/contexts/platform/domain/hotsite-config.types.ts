import { HexColor } from '../../../shared/value-objects/hex-color.vo';
import { SeoTitle } from '../../../shared/value-objects/seo-title.vo';
import { SeoDescription } from '../../../shared/value-objects/seo-description.vo';

// Split out of hotsite-config.aggregate.ts to keep it under the file-length cap: a max-lines
// exception was briefly kept for that file by copying booking.aggregate.ts's rationale without
// applying the same type-extraction technique, leaving 350 lines of pure type declarations before
// the class even started — extracting them here removed the need for any exception. Re-exported
// via `export *` in hotsite-config.aggregate.ts so every existing import of these names keeps
// resolving from that same path unchanged.

export type HotsiteModuleType =
  | 'HERO'
  | 'SERVICE_LIST'
  | 'GALLERY'
  | 'TESTIMONIALS'
  | 'BOOKING_CTA'
  | 'ABOUT'
  | 'CONTACT'
  | 'FOOTER'
  | 'CHATBOT'
  | 'LEAD_FORM';

// Shared by HeroModuleData/BookingCtaModuleData's backgroundImagePosition, contentPositionX, and
// contentPositionY fields — SonarCloud (S4323) flags a union type repeated verbatim across
// fields; these two aliases are the single source of truth for that shape (M18-S05).
export type HorizontalPosition = 'left' | 'center' | 'right';
export type VerticalPosition = 'top' | 'center' | 'bottom';

export interface HeroModuleData {
  variant: 'centered' | 'left-aligned';
  title: string;
  subtitle?: string;
  eyebrow?: string;
  backgroundImageUrl?: string;
  backgroundImagePosition?: HorizontalPosition;
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
  /** Present when source === 'booking' — derived server-side, lets the frontend label "Antes"/"Depois" */
  photoType?: 'before' | 'after';
  /** Natural pixel dimensions, captured at upload/pick time (M18-S06) — absent for images stored before that story */
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
  backgroundImagePosition?: HorizontalPosition;
  carouselDays?: number;
  datePickerType?: 'carousel' | 'calendar';
  bgStyle?: 'primary' | 'background';
  rightPanel?: 'none' | 'brand-card';
  contentPositionX?: HorizontalPosition;
  contentPositionY?: VerticalPosition;
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

// Mirrors packages/types/src/hotsite.ts's ChatbotModuleData — only fields rendered verbatim to
// every visitor; knowledgeText and the volume/cost caps are deliberately excluded (docs/15
// § CHATBOT), never part of this aggregate's own layout data.
export interface ChatbotModuleData {
  variant?: 'bubble' | 'inline';
  accentColor?: 'primary' | 'secondary';
  botName?: string;
  welcomeMessage?: string;
}

// Mirrors packages/types/src/hotsite.ts's LeadFormModuleData (S07) — teaser-only fields; the
// question catalog and audienceMode deliberately never appear here, since they live behind
// S01's own dedicated endpoints, not the cached manifest (docs/15 § LEAD_FORM).
export interface LeadFormModuleData {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  ctaLabel: string;
  variant?: 'centered' | 'left-aligned';
  backgroundImageUrl?: string | null;
  backgroundImagePosition?: HorizontalPosition;
  bgStyle?: 'primary' | 'background';
}

// Default when no LEAD_FORM entry exists in HotsiteConfig.layout[] yet (every tenant, until the
// first manager save via UpdateHotsiteContentUseCase) — mirrors BOOKING_CTA's own minimal default
// (apps/web/features/platform/hotsite/default-layout.ts), since this is the same shape family and
// shares its two required fields. Locked in during M20-S01 story-discovery, 2026-08-24 — there is
// no server-side "materialize on read" mechanism (materializeLayout() is a web-only, client-side
// helper that never persists). Colocated with the type it defaults, like DEFAULT_HOTSITE_BRANDING/
// DEFAULT_HOTSITE_SEO in hotsite-config.aggregate.ts — shared by two use cases (Get/Update), so it
// doesn't belong inside either one specifically.
export const DEFAULT_LEAD_FORM_MODULE_DATA: LeadFormModuleData = { title: '', ctaLabel: '' };

export type HotsiteModuleData =
  | HeroModuleData
  | ServiceListModuleData
  | GalleryModuleData
  | TestimonialsModuleData
  | BookingCtaModuleData
  | AboutModuleData
  | ContactModuleData
  | FooterModuleData
  | ChatbotModuleData
  | LeadFormModuleData;

export interface HotsiteModule {
  type: HotsiteModuleType;
  enabled: boolean;
  data: HotsiteModuleData;
}

export interface HotsiteBranding {
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
  /** Optional override of the button fill (filled) / hover-fill (outline, ghost) color. */
  buttonBackgroundColor?: string;
  /** Optional override of the button text (and outline border) color. */
  buttonTextColor?: string;
  // Visual rhythm
  heroBgStyle?: 'primary' | 'background';
  alternateSectionBg?: boolean;
  dividerStyle?: 'none' | 'gradient' | 'solid';
  // Brand identity (used by brand-card rightPanel in hero/booking-cta)
  brandName?: string;
  brandTagline?: string;
}

/** Internal aggregate representation — color fields held as typed VOs. */
export interface HotsiteBrandingProps {
  primaryColor: HexColor;
  secondaryColor: HexColor;
  backgroundColor: HexColor;
  textColor: HexColor;
  headingFontFamily: string;
  bodyFontFamily: string;
  logoUrl: string;
  borderRadius: 'sharp' | 'rounded' | 'pill';
  buttonStyle: 'filled' | 'outline' | 'ghost';
  spacing: 'compact' | 'comfortable' | 'spacious';
  shadowStyle: 'none' | 'subtle' | 'strong';
  buttonBackgroundColor?: HexColor;
  buttonTextColor?: HexColor;
  heroBgStyle?: 'primary' | 'background';
  alternateSectionBg?: boolean;
  dividerStyle?: 'none' | 'gradient' | 'solid';
  brandName?: string;
  brandTagline?: string;
}

export interface HotsiteSeo {
  title: string | null;
  description: string | null;
  /** Storage path (tenants/<id>/hotsite/... or tmp/<id>/...) or '' — same shape/treatment as HotsiteBranding.logoUrl, not wrapped in a VO. */
  ogImageUrl: string;
}

/** Internal aggregate representation — title/description held as typed VOs when set; ogImageUrl is a raw path like HotsiteBrandingProps.logoUrl. */
export interface HotsiteSeoProps {
  title: SeoTitle | null;
  description: SeoDescription | null;
  ogImageUrl: string;
}

export interface HotsiteConfigProps {
  id: string;
  tenantId: string;
  branding: HotsiteBrandingProps;
  layout: HotsiteModule[];
  seo: HotsiteSeoProps;
  isPublished: boolean;
  updatedAt: Date;
  /** Undefined for a not-yet-persisted aggregate (mirrors Booking.version) — set on load, bumped via markPersisted() after a successful save. */
  version?: number;
}

export type ReconstituteInput = Omit<HotsiteConfigProps, 'branding' | 'seo'> & {
  branding: HotsiteBranding;
  seo: HotsiteSeo;
};

export interface LayoutValidationContext {
  maxBookingAdvanceDays: number;
}
