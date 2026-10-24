import { Inject, Injectable } from '@nestjs/common';
import type { HotsiteTemplateCapability, HotsiteTemplateId } from '@ikaro/types';
import { IStorageService, STORAGE_SERVICE } from '../../../../shared/ports/storage.service.port';
import { ITemplateCatalogue, TEMPLATE_CATALOGUE } from '../ports/template-catalogue.port';

export interface ListHotsiteTemplatesUseCaseResult {
  templates: {
    id: HotsiteTemplateId;
    version: number;
    thumbnailUrl: string;
    capabilities: HotsiteTemplateCapability[];
  }[];
}

/**
 * The catalogue is platform-owned and identical for every tenant, so this reads nothing tenant
 * specific and touches no storage object: the thumbnail URL is a pure string build.
 */
@Injectable()
export class ListHotsiteTemplatesUseCase {
  constructor(
    @Inject(TEMPLATE_CATALOGUE) private readonly catalogue: ITemplateCatalogue,
    @Inject(STORAGE_SERVICE) private readonly storageService: IStorageService,
  ) {}

  execute(): ListHotsiteTemplatesUseCaseResult {
    return {
      templates: this.catalogue.list().map((entry) => ({
        id: entry.id,
        version: entry.version,
        thumbnailUrl: this.storageService.getPublicUrl(entry.thumbnailPath),
        capabilities: entry.capabilities,
      })),
    };
  }
}
