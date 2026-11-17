import { Injectable } from '@nestjs/common';
import { NAVIGATION_CTA_REQUIRED_MODULE, type NavigationCtaTarget } from '@ikaro/types';
import {
  HotsiteBranding,
  HotsiteModule,
  HotsiteModuleData,
  HotsiteSeo,
} from '../../domain/hotsite-config.aggregate';
import { assertValidLayoutStructure } from '../../domain/hotsite-layout.rules';
import { MaterializedTemplate } from '../ports/template-catalogue.port';

export interface HotsiteTemplateDraft {
  branding: Partial<HotsiteBranding>;
  layout: HotsiteModule[];
  seo: HotsiteSeo;
}

export interface MaterializeHotsiteTemplateInput {
  template: MaterializedTemplate;
  draft: HotsiteTemplateDraft;
  /** The tenant's `booking.maxBookingAdvanceDays`; a carousel can never show more days than this. */
  maxBookingAdvanceDays: number;
}

export interface MaterializeHotsiteTemplateResult {
  branding: HotsiteBranding;
  layout: HotsiteModule[];
  seo: HotsiteSeo;
  appliedSampleTestimonials: boolean;
}

const OPERATIONAL_MODULES: ReadonlySet<HotsiteModule['type']> = new Set(['LEAD_FORM', 'CHATBOT']);

type Collection = readonly unknown[] | undefined;

function hasItems(collection: Collection): boolean {
  return Array.isArray(collection) && collection.length > 0;
}

/**
 * Pure: turns a materialized template plus the manager's current draft into a new draft, following
 * the preservation matrix (docs/BUSINESS_LOGIC_REFERENCE.md § Hotsite template application). The
 * template supplies presentation; the draft keeps everything that is real tenant data. No I/O, no
 * clock, no randomness — the same input always gives the same output.
 */
@Injectable()
export class HotsiteTemplateMaterializer {
  materialize(input: MaterializeHotsiteTemplateInput): MaterializeHotsiteTemplateResult {
    const { template, draft } = input;
    const draftByType = new Map(draft.layout.map((module) => [module.type, module]));

    const layout = template.layout.map((templateModule): HotsiteModule => {
      const draftModule = draftByType.get(templateModule.type);
      if (draftModule === undefined) return templateModule;

      if (OPERATIONAL_MODULES.has(templateModule.type)) {
        return { ...templateModule, enabled: draftModule.enabled, data: draftModule.data };
      }
      if (templateModule.type === 'GALLERY') {
        return this.keepCollection(templateModule, draftModule, 'images');
      }
      if (templateModule.type === 'TESTIMONIALS') {
        return this.keepCollection(templateModule, draftModule, 'items');
      }
      return templateModule;
    });

    const safeLayout = this.fitToTenant(layout, input.maxBookingAdvanceDays);
    assertValidLayoutStructure(safeLayout);

    return {
      branding: this.mergeBranding(template, draft),
      layout: safeLayout,
      seo: draft.seo,
      appliedSampleTestimonials: this.appliedSamples(template, draftByType.get('TESTIMONIALS')),
    };
  }

  // True only when the template's own sample testimonials ended up in the result: the template
  // ships enabled samples and the draft had none of its own to keep.
  private appliedSamples(
    template: MaterializedTemplate,
    draft: HotsiteModule | undefined,
  ): boolean {
    const own = template.layout.find((module) => module.type === 'TESTIMONIALS');
    if (!own?.enabled) return false;
    return hasItems(this.collection(own, 'items')) && !hasItems(this.collection(draft, 'items'));
  }

  // The template's palette, typography, shape and rhythm; the draft's identity (name, tagline,
  // logo). Nothing else from the draft's branding survives — it is all presentation.
  private mergeBranding(
    template: MaterializedTemplate,
    draft: HotsiteTemplateDraft,
  ): HotsiteBranding {
    return {
      ...(template.branding as HotsiteBranding),
      logoUrl: draft.branding.logoUrl ?? '',
      ...(draft.branding.brandName === undefined ? {} : { brandName: draft.branding.brandName }),
      ...(draft.branding.brandTagline === undefined
        ? {}
        : { brandTagline: draft.branding.brandTagline }),
    };
  }

  // The tenant's own gallery images / testimonials survive an apply; the template's samples are
  // used only when the draft has none.
  private keepCollection(
    templateModule: HotsiteModule,
    draftModule: HotsiteModule,
    field: 'images' | 'items',
  ): HotsiteModule {
    const draftItems = this.collection(draftModule, field);
    if (!hasItems(draftItems)) return templateModule;
    return {
      ...templateModule,
      data: { ...(templateModule.data as object), [field]: draftItems } as HotsiteModuleData,
    };
  }

  private collection(module: HotsiteModule | undefined, field: 'images' | 'items'): Collection {
    return (module?.data as Record<string, Collection> | undefined)?.[field];
  }

  // Two template choices can clash with tenant data the template must not change; both resolve to
  // the closest valid value instead of producing a draft the manager cannot save.
  private fitToTenant(layout: HotsiteModule[], maxBookingAdvanceDays: number): HotsiteModule[] {
    const enabledTypes = new Set(layout.filter((module) => module.enabled).map((m) => m.type));
    return layout.map((module) => {
      const data = module.data as Record<string, unknown>;

      // A carousel can show at most the days the tenant lets customers book ahead.
      if (module.type === 'BOOKING_CTA' && typeof data.carouselDays === 'number') {
        if (data.carouselDays > maxBookingAdvanceDays) {
          return {
            ...module,
            data: { ...data, carouselDays: maxBookingAdvanceDays } as HotsiteModuleData,
          };
        }
      }

      // The header button may only point at a target whose module is enabled (the lead form needs
      // LEAD_FORM), and enabling it is the tenant's operational choice (preserved), not the
      // template's: the button falls back to the booking form, which needs no module.
      if (module.type === 'NAVIGATION') {
        const cta = data.cta as { target?: NavigationCtaTarget } | undefined;
        const required = cta?.target ? NAVIGATION_CTA_REQUIRED_MODULE[cta.target] : null;
        if (required && !enabledTypes.has(required)) {
          return {
            ...module,
            data: { ...data, cta: { ...cta, target: 'booking-form' } } as HotsiteModuleData,
          };
        }
      }
      return module;
    });
  }
}
