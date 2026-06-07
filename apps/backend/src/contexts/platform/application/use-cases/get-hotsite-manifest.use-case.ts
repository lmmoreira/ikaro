import { Inject, Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenant/tenant-context';
import {
  HotsiteNotFoundError,
  HotsiteNotPublishedError,
} from '../../domain/errors/platform-domain.error';
import { HotsiteBranding, HotsiteModule } from '../../domain/hotsite-config.aggregate';
import {
  HOTSITE_CONFIG_REPOSITORY,
  IHotsiteConfigRepository,
} from '../ports/hotsite-config-repository.port';

export interface GetHotsiteManifestUseCaseResult {
  branding: HotsiteBranding;
  layout: HotsiteModule[];
  isPublished: boolean;
}

@Injectable()
export class GetHotsiteManifestUseCase {
  constructor(
    @Inject(HOTSITE_CONFIG_REPOSITORY)
    private readonly hotsiteConfigRepo: IHotsiteConfigRepository,
    private readonly tenantContext: TenantContext,
  ) {}

  async execute(): Promise<GetHotsiteManifestUseCaseResult> {
    const config = await this.hotsiteConfigRepo.findByTenantId(this.tenantContext.tenantId);
    if (!config) throw new HotsiteNotFoundError(this.tenantContext.tenantId);
    if (!config.isPublished) throw new HotsiteNotPublishedError(this.tenantContext.tenantId);

    return {
      branding: config.branding,
      layout: config.layout,
      isPublished: config.isPublished,
    };
  }
}
