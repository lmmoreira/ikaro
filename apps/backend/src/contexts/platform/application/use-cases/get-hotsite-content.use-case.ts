import { Injectable } from '@nestjs/common';
import { RequestContext } from '../../../../shared/request/request-context';
import { HotsiteBranding, HotsiteModule, HotsiteSeo } from '../../domain/hotsite-config.aggregate';
import { HotsiteContentReader } from '../services/hotsite-content-reader.service';

export interface GetHotsiteContentUseCaseResult {
  branding: HotsiteBranding;
  layout: HotsiteModule[];
  seo: HotsiteSeo;
  isPublished: boolean;
  updatedAt: Date;
}

@Injectable()
export class GetHotsiteContentUseCase {
  constructor(
    private readonly tenantContext: RequestContext,
    private readonly hotsiteContentReader: HotsiteContentReader,
  ) {}

  async execute(): Promise<GetHotsiteContentUseCaseResult> {
    const content = await this.hotsiteContentReader.readResolved(this.tenantContext.tenantId);

    return {
      branding: content.branding,
      layout: content.layout,
      seo: content.seo,
      isPublished: content.isPublished,
      updatedAt: content.updatedAt,
    };
  }
}
