import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { HexColor } from '../../../shared/value-objects/hex-color.vo';
import { PlatformDomainError } from './errors/platform-domain.error';

export type HotsiteModuleType =
  | 'HERO'
  | 'SERVICE_LIST'
  | 'GALLERY'
  | 'TESTIMONIALS'
  | 'BOOKING_CTA'
  | 'ABOUT'
  | 'CONTACT'
  | 'FOOTER';

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
    | 'booking-form'
    | 'service-list'
    | 'gallery'
    | 'testimonials'
    | 'about'
    | 'contact';
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

export type HotsiteModuleData =
  | HeroModuleData
  | ServiceListModuleData
  | GalleryModuleData
  | TestimonialsModuleData
  | BookingCtaModuleData
  | AboutModuleData
  | ContactModuleData
  | FooterModuleData;

export interface HotsiteModule {
  type: HotsiteModuleType;
  enabled: boolean;
  data: HotsiteModuleData;
}

export interface HotsiteBranding {
  /** Validated #RRGGBB hex string — enforced by validateBranding() via HexColor.isValid(). Stored as string in JSONB. */
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

export interface HotsiteSeo {
  title: string | null;
  description: string | null;
}

export interface HotsiteConfigProps {
  id: string;
  tenantId: string;
  branding: HotsiteBranding;
  layout: HotsiteModule[];
  seo: HotsiteSeo;
  isPublished: boolean;
  updatedAt: Date;
}

const HEX_COLOR_FIELDS = [
  'primaryColor',
  'secondaryColor',
  'backgroundColor',
  'textColor',
] as const;
const OPTIONAL_HEX_COLOR_FIELDS = ['buttonBackgroundColor', 'buttonTextColor'] as const;
const BORDER_RADIUS_VALUES = ['sharp', 'rounded', 'pill'] as const;
const BUTTON_STYLE_VALUES = ['filled', 'outline', 'ghost'] as const;
const SPACING_VALUES = ['compact', 'comfortable', 'spacious'] as const;
const SHADOW_STYLE_VALUES = ['none', 'subtle', 'strong'] as const;
const HERO_BG_STYLE_VALUES = ['primary', 'background'] as const;
const DIVIDER_STYLE_VALUES = ['none', 'gradient', 'solid'] as const;

const MODULE_TYPES: ReadonlySet<HotsiteModuleType> = new Set([
  'HERO',
  'SERVICE_LIST',
  'GALLERY',
  'TESTIMONIALS',
  'BOOKING_CTA',
  'ABOUT',
  'CONTACT',
  'FOOTER',
]);

export const DEFAULT_HOTSITE_BRANDING: HotsiteBranding = {
  primaryColor: '#2563eb',
  secondaryColor: '#eff6ff',
  backgroundColor: '#ffffff',
  textColor: '#111827',
  headingFontFamily: 'Inter, sans-serif',
  bodyFontFamily: 'Inter, sans-serif',
  logoUrl: '',
  borderRadius: 'rounded',
  buttonStyle: 'filled',
  spacing: 'comfortable',
  shadowStyle: 'subtle',
};

export const DEFAULT_HOTSITE_SEO: HotsiteSeo = {
  title: null,
  description: null,
};

const SEO_TITLE_MAX_LENGTH = 70;
const SEO_DESCRIPTION_MAX_LENGTH = 160;

export class HotsiteConfig extends AggregateRoot {
  private readonly props: HotsiteConfigProps;

  private constructor(props: HotsiteConfigProps) {
    super();
    this.props = props;
  }

  get id(): string {
    return this.props.id;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get branding(): HotsiteBranding {
    return { ...this.props.branding };
  }

  get layout(): HotsiteModule[] {
    return [...this.props.layout];
  }

  get seo(): HotsiteSeo {
    return { ...this.props.seo };
  }

  get isPublished(): boolean {
    return this.props.isPublished;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  static create(tenantId: string): HotsiteConfig {
    return new HotsiteConfig({
      id: uuidv7(),
      tenantId,
      branding: { ...DEFAULT_HOTSITE_BRANDING },
      layout: [],
      seo: { ...DEFAULT_HOTSITE_SEO },
      isPublished: false,
      updatedAt: new Date(),
    });
  }

  static reconstitute(props: HotsiteConfigProps): HotsiteConfig {
    return new HotsiteConfig(props);
  }

  updateContent(
    branding: HotsiteBranding,
    layout: HotsiteModule[],
    seo: HotsiteSeo = DEFAULT_HOTSITE_SEO,
  ): void {
    this.validateBranding(branding);
    this.validateLayout(layout);
    this.validateSeo(seo);
    this.props.branding = branding;
    this.props.layout = layout;
    this.props.seo = seo;
    this.props.updatedAt = new Date();
  }

  publish(): void {
    if (!this.props.layout.some((module) => module.enabled)) {
      throw new PlatformDomainError('Cannot publish hotsite with no enabled modules');
    }
    this.props.isPublished = true;
    this.props.updatedAt = new Date();
  }

  unpublish(): void {
    this.props.isPublished = false;
    this.props.updatedAt = new Date();
  }

  private validateBranding(branding: HotsiteBranding): void {
    for (const field of HEX_COLOR_FIELDS) {
      if (!HexColor.isValid(branding[field])) {
        throw new PlatformDomainError(`${field} must be a valid hex color (e.g. #FF5733)`);
      }
    }
    for (const field of OPTIONAL_HEX_COLOR_FIELDS) {
      const value = branding[field];
      if (value !== undefined && !HexColor.isValid(value)) {
        throw new PlatformDomainError(`${field} must be a valid hex color (e.g. #FF5733)`);
      }
    }
    this.validateEnum('borderRadius', branding.borderRadius, BORDER_RADIUS_VALUES);
    this.validateEnum('buttonStyle', branding.buttonStyle, BUTTON_STYLE_VALUES);
    this.validateEnum('spacing', branding.spacing, SPACING_VALUES);
    this.validateEnum('shadowStyle', branding.shadowStyle, SHADOW_STYLE_VALUES);
    if (branding.heroBgStyle !== undefined) {
      this.validateEnum('heroBgStyle', branding.heroBgStyle, HERO_BG_STYLE_VALUES);
    }
    if (branding.dividerStyle !== undefined) {
      this.validateEnum('dividerStyle', branding.dividerStyle, DIVIDER_STYLE_VALUES);
    }
  }

  private validateEnum<T extends string>(field: string, value: T, allowed: readonly T[]): void {
    if (!allowed.includes(value)) {
      throw new PlatformDomainError(`${field} must be one of: ${allowed.join(', ')}`);
    }
  }

  private validateLayout(layout: HotsiteModule[]): void {
    for (const module of layout) {
      if (!MODULE_TYPES.has(module.type)) {
        throw new PlatformDomainError(`Unknown hotsite module type: '${module.type}'`);
      }
    }
  }

  private validateSeo(seo: HotsiteSeo): void {
    if (seo.title !== null && seo.title.length > SEO_TITLE_MAX_LENGTH) {
      throw new PlatformDomainError(`seo.title must be at most ${SEO_TITLE_MAX_LENGTH} characters`);
    }
    if (seo.description !== null && seo.description.length > SEO_DESCRIPTION_MAX_LENGTH) {
      throw new PlatformDomainError(
        `seo.description must be at most ${SEO_DESCRIPTION_MAX_LENGTH} characters`,
      );
    }
  }
}
