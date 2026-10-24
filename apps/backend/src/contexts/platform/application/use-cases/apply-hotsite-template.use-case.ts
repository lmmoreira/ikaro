import { Inject, Injectable } from '@nestjs/common';
import type { HotsiteTemplateId } from '@ikaro/types';
import { resolveSupportedLocale } from '@ikaro/i18n';
import { IStorageService, STORAGE_SERVICE } from '../../../../shared/ports/storage.service.port';
import {
  HotsiteTemplateNotFoundError,
  TenantNotFoundError,
} from '../../domain/errors/platform-domain.error';
import {
  DEFAULT_HOTSITE_SEO,
  HotsiteBranding,
  HotsiteModule,
  HotsiteModuleData,
  HotsiteSeo,
} from '../../domain/hotsite-config.aggregate';
import { HotsiteImageUrlResolver } from '../../domain/services/hotsite-image-url-resolver.service';
import { ApplyHotsiteTemplateDto } from '../dtos/apply-hotsite-template.dto';
import { ITenantRepository, TENANT_REPOSITORY } from '../ports/tenant-repository.port';
import { ITemplateCatalogue, TEMPLATE_CATALOGUE } from '../ports/template-catalogue.port';
import { HotsiteTemplateMaterializer } from '../services/hotsite-template-materializer.service';

export interface ApplyHotsiteTemplateUseCaseInput extends ApplyHotsiteTemplateDto {
  tenantId: string;
  templateId: string;
}

export interface ApplyHotsiteTemplateUseCaseResult {
  content: { branding: HotsiteBranding; layout: HotsiteModule[]; seo: HotsiteSeo };
  appliedTemplate: { id: HotsiteTemplateId; version: number };
  appliedSampleTestimonials: boolean;
}

/**
 * A pure function of the request body, the tenant from the JWT and that tenant's own language:
 * it persists nothing (no HotsiteConfig write, `isPublished` untouched), calls no storage method
 * other than the string-building `getPublicUrl`, and creates no Service. The manager sees the
 * result as the live draft and publishes through the existing flow.
 */
@Injectable()
export class ApplyHotsiteTemplateUseCase {
  constructor(
    @Inject(TENANT_REPOSITORY) private readonly tenantRepo: ITenantRepository,
    @Inject(TEMPLATE_CATALOGUE) private readonly catalogue: ITemplateCatalogue,
    @Inject(STORAGE_SERVICE) private readonly storageService: IStorageService,
    private readonly materializer: HotsiteTemplateMaterializer,
    private readonly imageUrlResolver: HotsiteImageUrlResolver,
  ) {}

  async execute(
    input: ApplyHotsiteTemplateUseCaseInput,
  ): Promise<ApplyHotsiteTemplateUseCaseResult> {
    const { tenantId, templateId, content } = input;
    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) throw new TenantNotFoundError(tenantId);

    const brandName = content.branding.brandName || tenant.name;
    const template = this.catalogue.materialize(
      templateId,
      resolveSupportedLocale(tenant.settings.localization.language),
      { brandName, tagline: content.branding.brandTagline ?? '' },
    );
    if (template === null) throw new HotsiteTemplateNotFoundError(templateId);

    const result = this.materializer.materialize({
      template,
      draft: {
        branding: content.branding,
        layout: this.toDomainLayout(content.layout),
        seo: { ...DEFAULT_HOTSITE_SEO, ...content.seo },
      },
      maxBookingAdvanceDays: tenant.settings.booking.maxBookingAdvanceDays,
    });

    const resolved = this.imageUrlResolver.resolve(
      result.branding,
      result.layout,
      result.seo,
      (storagePath) => this.storageService.getPublicUrl(storagePath),
    );

    return {
      content: { branding: resolved.branding, layout: resolved.layout, seo: resolved.seo },
      appliedTemplate: { id: template.id, version: template.version },
      appliedSampleTestimonials: result.appliedSampleTestimonials,
    };
  }

  private toDomainLayout(layout: ApplyHotsiteTemplateDto['content']['layout']): HotsiteModule[] {
    return layout.map((module) => ({
      type: module.type,
      enabled: module.enabled,
      // Same boundary as UpdateHotsiteContentUseCase: the request schema narrows per module type,
      // the domain keeps one HotsiteModule shape.
      data: module.data as HotsiteModuleData,
      ...(module.presentation === undefined ? {} : { presentation: module.presentation }),
    }));
  }
}
