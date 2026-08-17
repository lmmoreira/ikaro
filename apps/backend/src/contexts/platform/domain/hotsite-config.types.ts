import { HexColor } from '../../../shared/value-objects/hex-color.vo';
import { SeoTitle } from '../../../shared/value-objects/seo-title.vo';
import { SeoDescription } from '../../../shared/value-objects/seo-description.vo';

// Split out of hotsite-config.aggregate.ts (TD37-S05, file-length — PR #386 review finding: the
// exception originally kept for this file copied booking.aggregate.ts's rationale without
// applying the same type-extraction fix, leaving 350 lines of pure type declarations before the
// class even started). Re-exported via `export *` in hotsite-config.aggregate.ts so every
// existing import of these names keeps resolving from that same path unchanged.

export type HotsiteModuleType =
  | 'HERO'
  | 'SERVICE_LIST'
  | 'GALLERY'
  | 'TESTIMONIALS'
  | 'BOOKING_CTA'
  | 'ABOUT'
  | 'CONTACT'
  | 'FOOTER'
  | 'CHATBOT';

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

export type HotsiteModuleData =
  | HeroModuleData
  | ServiceListModuleData
  | GalleryModuleData
  | TestimonialsModuleData
  | BookingCtaModuleData
  | AboutModuleData
  | ContactModuleData
  | FooterModuleData
  | ChatbotModuleData;

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
