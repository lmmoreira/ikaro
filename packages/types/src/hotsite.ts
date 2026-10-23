import type { HotsiteModuleType, ResourceType } from './enums';
import type { Money, MoneyAmount } from './money';
import type {
  ResourceRequirementSelectionMode,
  ServiceBookingModel,
  ServiceDurationPolicy,
  ServicePricingPolicy,
} from './service.dto';
import type { LeadFormAudienceMode, LeadFormQuestion, TenantInfoResponse } from './tenant.dto';

export type { HotsiteModuleType };

// ─── Module data contracts (docs/HOTSITE_DYNAMIC_ARCHITECTURE.md §4) ──────

// Shared by HeroModuleData/BookingCtaModuleData's backgroundImagePosition, contentPositionX, and
// contentPositionY fields — a single source of truth for this repeated union shape rather than
// spelling it out at every field (SonarCloud S4323 precedent, M18-S05).
export type HorizontalPosition = 'left' | 'center' | 'right';
export type VerticalPosition = 'top' | 'center' | 'bottom';

export interface HeroModuleData {
  variant: 'centered' | 'left-aligned' | 'immersive';
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

// What a service card does when clicked (TD56). Omitted ⇒ 'none', today's behaviour.
export type ServiceListItemAction = 'details' | 'booking' | 'none';

// Look of every public service detail page (/{slug}/servicos/{serviceSlug}). Omitted ⇒
// SERVICE_DETAIL_PAGE_DEFAULTS in the renderer, so a legacy manifest is unchanged.
export interface ServiceDetailPageSettings {
  heroStyle: 'cover' | 'compact';
  galleryLayout: 'grid' | 'featured';
  showPrice: boolean;
  showDuration: boolean;
  showLoyaltyPoints: boolean;
  bookingCtaLabel?: string;
}

export interface ServiceListModuleData {
  title?: string;
  eyebrow?: string;
  showPrices: boolean;
  showPoints: boolean;
  layout: 'grid' | 'list' | 'numbered' | 'feature-cards';
  itemAction?: ServiceListItemAction;
  itemCtaLabel?: string;
  detailPage?: ServiceDetailPageSettings;
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
  layout: 'grid' | 'masonry' | 'featured' | 'portfolio';
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
  layout: 'grid' | 'carousel' | 'editorial-quote';
}

export interface BookingCtaModuleData {
  variant?: 'centered' | 'left-aligned' | 'immersive';
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
  // Omitted ⇒ 'split', today's behaviour (image beside the copy; imagePosition applies inside it).
  variant?: 'split' | 'editorial';
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

// Only fields rendered verbatim to every visitor — see docs/HOTSITE_DYNAMIC_ARCHITECTURE.md
// § CHATBOT for why knowledgeText and the volume/cost caps are deliberately excluded here and
// fetched separately, never shipped into the cached public manifest.
export interface ChatbotModuleData {
  variant?: 'bubble' | 'inline';
  accentColor?: 'primary' | 'secondary';
  botName?: string;
  welcomeMessage?: string;
}

// Teaser-only — see docs/HOTSITE_DYNAMIC_ARCHITECTURE.md § LEAD_FORM for why the manager-
// authored question catalog (up to 20 questions) stays out of this manifest-embedded shape and is
// fetched separately, only when a visitor actually reaches /[slug]/lead-form. Deliberately
// excludes audienceMode/questions, which live behind their own endpoints, not the cached manifest.
export interface LeadFormModuleData {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  ctaLabel: string;
  variant?: 'centered' | 'left-aligned' | 'immersive';
  // Nullable — see HeroModuleData.backgroundImageUrl's comment above for why.
  backgroundImageUrl?: string | null;
  backgroundImagePosition?: HorizontalPosition;
  bgStyle?: 'primary' | 'background';
}

// ─── TD56 modules: NAVIGATION and CONTENT_BLOCK ─────────────────────────────

// Same-page section anchors only (#service-list, #gallery, …). Booking is never a navigation item
// and the separate /lead-form route is not an anchor.
export type HotsiteNavigationTarget =
  'service-list' | 'gallery' | 'testimonials' | 'about' | 'contact';

export interface HotsiteNavigationItem {
  label: string;
  target: HotsiteNavigationTarget;
}

export interface NavigationModuleData {
  items: HotsiteNavigationItem[];
}

// Same target set as HeroModuleData.ctaTarget — not cross-checked against enabled modules.
export type ContentBlockCtaTarget =
  'booking-form' | 'service-list' | 'gallery' | 'testimonials' | 'about' | 'contact';

export interface ContentBlockCta {
  label: string;
  target: ContentBlockCtaTarget;
}

export interface ContentBlockCommon {
  align?: 'left' | 'center' | 'right';
  eyebrow?: string;
  title: string;
  /** Restricted Markdown (paragraphs, emphasis, lists, links) — never HTML. */
  body?: string;
  cta?: ContentBlockCta;
}

export interface ContentBlockTrustGridData extends ContentBlockCommon {
  variant: 'trust-grid';
  items: { label: string; description?: string }[];
}

export interface ContentBlockProcessStepsData extends ContentBlockCommon {
  variant: 'process-steps';
  items: { title: string; body: string }[];
}

export interface ContentBlockCollageCalloutData extends ContentBlockCommon {
  variant: 'collage-callout';
  /** An empty `alt` means the image is decorative. */
  images: { url: string; alt?: string }[];
}

export interface ContentBlockTechnicalCalloutData extends ContentBlockCommon {
  variant: 'technical-callout';
  facts?: { value: string; label: string }[];
}

export interface ContentBlockImageStatementData extends ContentBlockCommon {
  variant: 'image-statement';
}

export interface ContentBlockImmersiveStatementData extends ContentBlockCommon {
  variant: 'immersive-statement';
}

export type ContentBlockModuleData =
  | ContentBlockTrustGridData
  | ContentBlockProcessStepsData
  | ContentBlockCollageCalloutData
  | ContentBlockTechnicalCalloutData
  | ContentBlockImageStatementData
  | ContentBlockImmersiveStatementData;

// ─── Section presentation (sibling of `data` on a module entry) ──────────────

export type HotsiteSectionSurface = 'background' | 'secondary' | 'primary' | 'custom';
export type HotsiteSectionContentWidth = 'narrow' | 'standard' | 'wide' | 'full';
export type HotsiteSectionMinHeight = 'auto' | 'sm' | 'md' | 'lg' | 'viewport';
export type HotsiteSectionPadding = 'none' | 'compact' | 'comfortable' | 'spacious';
export type HotsiteOverlayDirection = 'to-right' | 'to-left' | 'to-bottom' | 'to-top';

export type HotsiteSectionOverlay =
  | { type: 'none' }
  | { type: 'solid'; color: string; opacity: number }
  | {
      type: 'linear-gradient';
      direction: HotsiteOverlayDirection;
      fromColor: string;
      fromOpacity: number;
      toColor: string;
      toOpacity: number;
    };

export interface HotsiteSectionBackground {
  imageUrl: string | null;
  position?: HorizontalPosition;
}

/**
 * Optional semantic presentation of a module's full-width section. Omitted fields resolve to the
 * current renderer defaults, so a module without it renders exactly as before TD56.
 */
export interface HotsiteModulePresentation {
  surface?: HotsiteSectionSurface;
  /** Required when `surface` is 'custom', rejected otherwise. Strict #RRGGBB. */
  customColor?: string;
  contentWidth?: HotsiteSectionContentWidth;
  minHeight?: HotsiteSectionMinHeight;
  padding?: HotsiteSectionPadding;
  background?: HotsiteSectionBackground;
  overlay?: HotsiteSectionOverlay;
}

// The controlled font registry: the keys a manifest may store in branding.headingFontFamily /
// bodyFontFamily. apps/web preloads exactly these through next/font (font-config.ts, whose spec
// pins the two lists together) and @ikaro/validation rejects anything else at the request boundary.
// A new font is added here AND in font-config.ts — never as a free-form string in a manifest.
export const HOTSITE_FONT_FAMILIES = [
  'Inter',
  'Poppins',
  'Playfair Display',
  'Montserrat',
  'Raleway',
  'Oswald',
  'Lato',
  'Roboto',
] as const;

export type HotsiteFontFamily = (typeof HOTSITE_FONT_FAMILIES)[number];

// What HotsiteConfig.create() stores for a brand-new tenant. It is not a registry key — the
// renderer falls back to Inter for it — but it is already persisted for every tenant that has not
// picked a font, and the editor sends the whole branding back on save, so it must stay accepted.
export const HOTSITE_LEGACY_DEFAULT_FONT_FAMILY = 'Inter, sans-serif';

// ─── BFF response types ───────────────────────────────────────────────────────

export interface HotsiteModuleResponse {
  type: HotsiteModuleType;
  enabled: boolean;
  data: Record<string, unknown>;
  presentation?: HotsiteModulePresentation;
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
// promotion can rebuild the permanent path without a second lookup. The one closed list: the
// backend DTO and the BFF schema build their Zod enum from this tuple (like
// ALLOWED_IMAGE_CONTENT_TYPES), and apps/web (SingleImageUploadField.tsx, tenant-settings.ts) types
// against the derived union — adding a purpose here reaches all four consumers at once. Before
// TD56 each kept its own hand-copied list.
export const HOTSITE_IMAGE_PURPOSES = [
  'branding',
  'hero',
  'gallery',
  'about',
  'booking-cta',
  'testimonials',
  'seo-og-image',
  'lead-form',
  'content-block',
  'section-background',
  'service-profile',
] as const;

export type HotsiteImagePurpose = (typeof HOTSITE_IMAGE_PURPOSES)[number];

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

// Public counterpart of ResourceRequirementItem — never carries resourcePoolIds (which resources a
// tenant restricts a requirement to is not a public fact; see HotsiteServiceResourceOptionsResponse
// for what a customer may actually pick).
export interface HotsiteServiceResourceRequirement {
  type: ResourceType;
  selectionMode: ResourceRequirementSelectionMode;
  requiredQuantity: number;
}

export interface HotsiteServiceLeg {
  legIndex: number;
  name: string;
  durationMinutes: number;
  resourceRequirements: HotsiteServiceResourceRequirement[];
  transitionGapAfterMinutes: number;
}

// The subset of the service's booking policy the booking flow reads — no raw override, approval,
// hold or class-slot fields. The effective booking window is the service's own override already
// clamped to the tenant window, so the page never recomputes it. `availabilityAlertEligible` is the
// one availability-alert field: the calendar step reads it to decide whether to offer "Avise-me
// quando abrir" (M23-S31).
export interface HotsiteServiceBookingPolicy {
  effectiveMinBookingAdvanceHours: number;
  effectiveMaxBookingAdvanceDays: number;
  durationPolicy: ServiceDurationPolicy;
  durationMinMinutes: number | null;
  durationMaxMinutes: number | null;
  durationIncrementMinutes: number | null;
  pricingPolicy: ServicePricingPolicy;
  pricingIncrementMinutes: number | null;
  pricePerIncrementAmount: number | null;
  minimumChargeAmount: number | null;
  recurrenceEligible: boolean;
  recurringHorizonDays: number | null;
  availabilityAlertEligible: boolean;
}

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
  bookingModel: ServiceBookingModel;
  resourceRequirements: HotsiteServiceResourceRequirement[];
  legs: HotsiteServiceLeg[] | null;
  bookingPolicy: HotsiteServiceBookingPolicy;
}

export interface HotsiteServiceListResponse {
  items: HotsiteServiceResponse[];
}

// GET /public/services/:id/resource-options — the CUSTOMER_CHOICE requirements of a service and
// the active resources a customer may pick for each (id and name only).
export interface HotsiteServiceResourceOption {
  resourceId: string;
  name: string;
}

export interface HotsiteServiceResourceOptionsRequirement {
  serviceId: string;
  legIndex: number | null;
  resourceType: ResourceType;
  selectionMode: 'CUSTOMER_CHOICE';
  requiredQuantity: number;
  options: HotsiteServiceResourceOption[];
}

export interface HotsiteServiceResourceOptionsResponse {
  requirements: HotsiteServiceResourceOptionsRequirement[];
}

// GET /public/services/:id/quote — what booking creation would persist for the chosen duration.
export interface HotsiteServiceQuoteResponse {
  durationMinutes: number;
  price: MoneyAmount;
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

// ─── Lead Form widget (Public — UC-038, UC-039, UC-040, M20-S05) ───────────────

export interface HotsiteLeadFormConfigResponse {
  audienceMode: LeadFormAudienceMode;
  questions: LeadFormQuestion[];
}

export interface HotsiteLeadFormAnswerRequest {
  questionId: string;
  value: string | string[];
}

export interface HotsiteLeadFormSubmissionResponse {
  submissionId: string;
}
