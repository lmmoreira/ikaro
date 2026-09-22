import { HOTSITE_MODULE_TYPES } from '@ikaro/validation';
import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { HexColor } from '../../../shared/value-objects/hex-color.vo';
import { SeoTitle } from '../../../shared/value-objects/seo-title.vo';
import { SeoDescription } from '../../../shared/value-objects/seo-description.vo';
import {
  HotsiteBrandingColorInvalidError,
  HotsiteBrandingOptionInvalidError,
  HotsiteCarouselDaysExceedsMaxAdvanceError,
  HotsiteModuleTypeInvalidError,
  HotsiteNoEnabledModulesError,
  HotsiteSeoDescriptionTooLongError,
  HotsiteSeoTitleTooLongError,
} from './errors/platform-domain.error';
import {
  brandingFromDomain,
  brandingReconstitute,
  brandingToDomain,
  seoEquals,
  seoFromDomain,
  seoReconstitute,
  seoToDomain,
} from './hotsite-config.mapper';
import {
  HotsiteBranding,
  HotsiteConfigProps,
  HotsiteModule,
  HotsiteModuleData,
  HotsiteModuleType,
  HotsiteSeo,
  LayoutValidationContext,
  ReconstituteInput,
  BookingCtaModuleData,
} from './hotsite-config.types';

// Types moved to hotsite-config.types.ts, mapper functions to hotsite-config.mapper.ts to keep
// this file under the file-length cap — see hotsite-config.types.ts for the extraction rationale.
// Every name still resolves from this same path via the re-export below.
export * from './hotsite-config.types';

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

// Derived from @ikaro/validation's canonical HOTSITE_MODULE_TYPES tuple (TD37-S21) instead of a
// hand-typed literal array — a real (non-type-only) import, confirmed safe: shared/value-objects/
// (e.g. email.vo.ts) already does the identical thing in framework-free domain-adjacent code, and
// @ikaro/validation's compiled dist/index.js already pulls in zod transitively the moment anything
// is imported from it, independent of this call site.
const MODULE_TYPES: ReadonlySet<HotsiteModuleType> = new Set(HOTSITE_MODULE_TYPES);

type ModuleDataValidator = (data: HotsiteModuleData, ctx: LayoutValidationContext) => void;

/**
 * Per-module-type data validators, dispatched by `validateLayout()`. Only module types with an
 * actual business rule get an entry — most module `data` shapes are intentionally unvalidated
 * here (enforced only by the web zod schema), so this stays sparse rather than exhaustive.
 */
const MODULE_DATA_VALIDATORS: Partial<Record<HotsiteModuleType, ModuleDataValidator>> = {
  BOOKING_CTA: (data, ctx) => {
    const { carouselDays, datePickerType } = data as BookingCtaModuleData;
    // A stale carouselDays value retained from a prior carousel configuration must not block
    // saving an unrelated field once the picker has been switched to calendar — carouselDays is
    // inert in that mode, on both this validator's own terms and the web page's rendering logic.
    const isCarouselMode = (datePickerType ?? 'carousel') === 'carousel';
    if (isCarouselMode && carouselDays !== undefined && carouselDays > ctx.maxBookingAdvanceDays) {
      throw new HotsiteCarouselDaysExceedsMaxAdvanceError(carouselDays, ctx.maxBookingAdvanceDays);
    }
  },
};

export const DEFAULT_HOTSITE_BRANDING: HotsiteBranding = {
  primaryColor: '#2563EB',
  secondaryColor: '#EFF6FF',
  backgroundColor: '#FFFFFF',
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
  ogImageUrl: '',
};

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
    return brandingFromDomain(this.props.branding);
  }

  get layout(): HotsiteModule[] {
    return [...this.props.layout];
  }

  get seo(): HotsiteSeo {
    return seoFromDomain(this.props.seo);
  }

  get isPublished(): boolean {
    return this.props.isPublished;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get version(): number | undefined {
    return this.props.version;
  }

  static create(tenantId: string): HotsiteConfig {
    return new HotsiteConfig({
      id: uuidv7(),
      tenantId,
      branding: brandingToDomain(DEFAULT_HOTSITE_BRANDING),
      layout: [],
      seo: seoToDomain(DEFAULT_HOTSITE_SEO),
      isPublished: false,
      updatedAt: new Date(),
    });
  }

  static reconstitute(props: ReconstituteInput): HotsiteConfig {
    return new HotsiteConfig({
      ...props,
      branding: brandingReconstitute(props.branding),
      seo: seoReconstitute(props.seo),
    });
  }

  /** Called by the repository right after a successful save — never call directly. */
  markPersisted(version: number): void {
    this.props.version = version;
  }

  updateContent(
    branding: HotsiteBranding,
    layout: HotsiteModule[],
    seo: HotsiteSeo,
    ctx: LayoutValidationContext,
  ): void {
    this.validateBranding(branding);
    this.validateLayout(layout, ctx);
    this.props.branding = brandingToDomain(branding);
    this.props.layout = layout;
    // Only re-validate seo when it's actually changing. UpdateHotsiteContentUseCase passes
    // through the existing stored seo unchanged on every branding/layout-only PATCH — validating
    // it here regardless would block ALL future updates for any tenant whose stored title/
    // description was valid under a since-tightened limit (e.g. saved under the pre-M13-S37
    // 70/160 char rule, now exceeding the current 60/158), even when this call never touches seo.
    if (!seoEquals(seo, this.seo)) {
      this.validateSeo(seo);
      this.props.seo = seoToDomain(seo);
    }
    this.props.updatedAt = new Date();
  }

  publish(): void {
    if (!this.props.layout.some((module) => module.enabled)) {
      throw new HotsiteNoEnabledModulesError();
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
        throw new HotsiteBrandingColorInvalidError(field);
      }
    }
    for (const field of OPTIONAL_HEX_COLOR_FIELDS) {
      const value = branding[field];
      if (value !== undefined && !HexColor.isValid(value)) {
        throw new HotsiteBrandingColorInvalidError(field);
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
      throw new HotsiteBrandingOptionInvalidError(field, allowed);
    }
  }

  private validateLayout(layout: HotsiteModule[], ctx: LayoutValidationContext): void {
    for (const module of layout) {
      if (!MODULE_TYPES.has(module.type)) {
        throw new HotsiteModuleTypeInvalidError(module.type);
      }
      MODULE_DATA_VALIDATORS[module.type]?.(module.data, ctx);
    }
  }

  private validateSeo(seo: HotsiteSeo): void {
    if (seo.title !== null && !SeoTitle.isValid(seo.title)) {
      throw new HotsiteSeoTitleTooLongError(SeoTitle.MAX_LENGTH);
    }
    if (seo.description !== null && !SeoDescription.isValid(seo.description)) {
      throw new HotsiteSeoDescriptionTooLongError(SeoDescription.MAX_LENGTH);
    }
  }
}
