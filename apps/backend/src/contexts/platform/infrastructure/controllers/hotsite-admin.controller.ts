import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RequestContext } from '../../../../shared/request/request-context';
import { ZodValidationPipe } from '../../../../shared/http/zod-validation.pipe';
import { ManagerRoleGuard } from '../../../../shared/guards/manager-role.guard';
import {
  FeatureBookingPhotoDto,
  FeatureBookingPhotoSchema,
} from '../../application/dtos/feature-booking-photo.dto';
import {
  GenerateHotsiteImageSignedUrlDto,
  GenerateHotsiteImageSignedUrlSchema,
} from '../../application/dtos/generate-hotsite-image-signed-url.dto';
import {
  UpdateHotsiteContentDto,
  UpdateHotsiteContentSchema,
} from '../../application/dtos/update-hotsite-content.dto';
import {
  FeatureBookingPhotoUseCase,
  FeatureBookingPhotoUseCaseResult,
} from '../../application/use-cases/feature-booking-photo.use-case';
import {
  GenerateHotsiteImageSignedUrlUseCase,
  GenerateHotsiteImageSignedUrlUseCaseResult,
} from '../../application/use-cases/generate-hotsite-image-signed-url.use-case';
import {
  GetHotsiteContentUseCase,
  GetHotsiteContentUseCaseResult,
} from '../../application/use-cases/get-hotsite-content.use-case';
import {
  PublishHotsiteUseCase,
  PublishHotsiteUseCaseResult,
} from '../../application/use-cases/publish-hotsite.use-case';
import {
  UnpublishHotsiteUseCase,
  UnpublishHotsiteUseCaseResult,
} from '../../application/use-cases/unpublish-hotsite.use-case';
import {
  UpdateHotsiteContentUseCase,
  UpdateHotsiteContentUseCaseResult,
} from '../../application/use-cases/update-hotsite-content.use-case';
import { mapPlatformError } from '../http/platform-error.mapper';

@Controller('tenants/hotsite')
@UseGuards(ManagerRoleGuard)
export class HotsiteAdminController {
  constructor(
    private readonly ctx: RequestContext,
    private readonly getHotsiteContent: GetHotsiteContentUseCase,
    private readonly updateHotsiteContent: UpdateHotsiteContentUseCase,
    private readonly publishHotsite: PublishHotsiteUseCase,
    private readonly unpublishHotsite: UnpublishHotsiteUseCase,
    private readonly generateHotsiteImageSignedUrl: GenerateHotsiteImageSignedUrlUseCase,
    private readonly featureHotsiteBookingPhoto: FeatureBookingPhotoUseCase,
  ) {}

  @Get()
  getContent(): Promise<GetHotsiteContentUseCaseResult> {
    return this.getHotsiteContent.execute({ tenantId: this.ctx.tenantId }).catch(mapPlatformError);
  }

  @Patch()
  @HttpCode(HttpStatus.OK)
  updateContent(
    @Body(new ZodValidationPipe(UpdateHotsiteContentSchema)) dto: UpdateHotsiteContentDto,
  ): Promise<UpdateHotsiteContentUseCaseResult> {
    return this.updateHotsiteContent.execute({ ...dto, tenantId: this.ctx.tenantId }).catch(mapPlatformError);
  }

  @Post('publish')
  @HttpCode(HttpStatus.OK)
  publish(): Promise<PublishHotsiteUseCaseResult> {
    return this.publishHotsite.execute({ tenantId: this.ctx.tenantId }).catch(mapPlatformError);
  }

  @Post('unpublish')
  @HttpCode(HttpStatus.OK)
  unpublish(): Promise<UnpublishHotsiteUseCaseResult> {
    return this.unpublishHotsite.execute({ tenantId: this.ctx.tenantId }).catch(mapPlatformError);
  }

  @Post('images/signed-url')
  @HttpCode(HttpStatus.CREATED)
  generateImageSignedUrl(
    @Body(new ZodValidationPipe(GenerateHotsiteImageSignedUrlSchema))
    dto: GenerateHotsiteImageSignedUrlDto,
  ): Promise<GenerateHotsiteImageSignedUrlUseCaseResult> {
    return this.generateHotsiteImageSignedUrl.execute({ ...dto, tenantId: this.ctx.tenantId }).catch(mapPlatformError);
  }

  @Post('gallery/feature-booking-photo')
  @HttpCode(HttpStatus.CREATED)
  featureBookingPhoto(
    @Body(new ZodValidationPipe(FeatureBookingPhotoSchema)) dto: FeatureBookingPhotoDto,
  ): Promise<FeatureBookingPhotoUseCaseResult> {
    return this.featureHotsiteBookingPhoto.execute({ ...dto, tenantId: this.ctx.tenantId }).catch(mapPlatformError);
  }
}
