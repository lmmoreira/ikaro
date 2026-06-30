import { Injectable } from '@nestjs/common';
import { HotsiteBranding, HotsiteModule, HotsiteSeo } from '../../domain/hotsite-config.aggregate';
import { HotsiteContentReader } from '../services/hotsite-content-reader.service';

export interface GetHotsiteContentUseCaseInput {
  tenantId: string;
}

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
    private readonly hotsiteContentReader: HotsiteContentReader,
  ) {}

  async execute({ tenantId }: GetHotsiteContentUseCaseInput): Promise<GetHotsiteContentUseCaseResult> {
    const content = await this.hotsiteContentReader.readResolved(tenantId);

    return {
      branding: content.branding,
      layout: content.layout,
      seo: content.seo,
      isPublished: content.isPublished,
      updatedAt: content.updatedAt,
    };
  }
}
