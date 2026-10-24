import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RequestContext } from '../../../../shared/request/request-context';
import { ZodValidationPipe } from '@ikaro/nestjs-http';
import { ManagerRoleGuard } from '../../../../shared/guards/manager-role.guard';
import {
  ApplyHotsiteTemplateDto,
  ApplyHotsiteTemplateSchema,
} from '../../application/dtos/apply-hotsite-template.dto';
import {
  DeleteHotsiteImageDto,
  DeleteHotsiteImageSchema,
} from '../../application/dtos/delete-hotsite-image.dto';
import {
  FeatureBookingPhotoDto,
  FeatureBookingPhotoSchema,
} from '../../application/dtos/feature-booking-photo.dto';
import {
  GenerateHotsiteImageReadSignedUrlDto,
  GenerateHotsiteImageReadSignedUrlSchema,
} from '../../application/dtos/generate-hotsite-image-read-signed-url.dto';
import {
  GenerateHotsiteImageSignedUrlDto,
  GenerateHotsiteImageSignedUrlSchema,
} from '../../application/dtos/generate-hotsite-image-signed-url.dto';
import {
  UpdateHotsiteContentDto,
  UpdateHotsiteContentSchema,
} from '../../application/dtos/update-hotsite-content.dto';
import {
  ApplyHotsiteTemplateUseCase,
  ApplyHotsiteTemplateUseCaseResult,
} from '../../application/use-cases/apply-hotsite-template.use-case';
import { DeleteHotsiteImageUseCase } from '../../application/use-cases/delete-hotsite-image.use-case';
import {
  FeatureBookingPhotoUseCase,
  FeatureBookingPhotoUseCaseResult,
} from '../../application/use-cases/feature-booking-photo.use-case';
import {
  GenerateHotsiteImageReadSignedUrlUseCase,
  GenerateHotsiteImageReadSignedUrlUseCaseResult,
} from '../../application/use-cases/generate-hotsite-image-read-signed-url.use-case';
import {
  GenerateHotsiteImageSignedUrlUseCase,
  GenerateHotsiteImageSignedUrlUseCaseResult,
} from '../../application/use-cases/generate-hotsite-image-signed-url.use-case';
import {
  GetHotsiteContentUseCase,
  GetHotsiteContentUseCaseResult,
} from '../../application/use-cases/get-hotsite-content.use-case';
import {
  ListHotsiteTemplatesUseCase,
  ListHotsiteTemplatesUseCaseResult,
} from '../../application/use-cases/list-hotsite-templates.use-case';
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
    private readonly generateHotsiteImageReadSignedUrl: GenerateHotsiteImageReadSignedUrlUseCase,
    private readonly featureHotsiteBookingPhoto: FeatureBookingPhotoUseCase,
    private readonly deleteHotsiteImage: DeleteHotsiteImageUseCase,
    private readonly listHotsiteTemplates: ListHotsiteTemplatesUseCase,
    private readonly applyHotsiteTemplate: ApplyHotsiteTemplateUseCase,
  ) {}

  @Get()
  getContent(): Promise<GetHotsiteContentUseCaseResult> {
    return this.getHotsiteContent.execute({ tenantId: this.ctx.tenantId }).catch(mapPlatformError);
  }

  // Static segment before any dynamic one: the catalogue is identical for every tenant.
  @Get('templates')
  listTemplates(): ListHotsiteTemplatesUseCaseResult {
    return this.listHotsiteTemplates.execute();
  }

  // Pure: returns the draft with the template applied and persists nothing — the manager previews
  // it as the live draft and publishes through the existing flow.
  @Post('templates/:templateId/apply')
  @HttpCode(HttpStatus.OK)
  applyTemplate(
    @Param('templateId') templateId: string,
    @Body(new ZodValidationPipe(ApplyHotsiteTemplateSchema)) dto: ApplyHotsiteTemplateDto,
  ): Promise<ApplyHotsiteTemplateUseCaseResult> {
    return this.applyHotsiteTemplate
      .execute({ ...dto, templateId, tenantId: this.ctx.tenantId })
      .catch(mapPlatformError);
  }

  @Patch()
  @HttpCode(HttpStatus.OK)
  updateContent(
    @Body(new ZodValidationPipe(UpdateHotsiteContentSchema)) dto: UpdateHotsiteContentDto,
  ): Promise<UpdateHotsiteContentUseCaseResult> {
    return this.updateHotsiteContent
      .execute({ ...dto, tenantId: this.ctx.tenantId })
      .catch(mapPlatformError);
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
    return this.generateHotsiteImageSignedUrl
      .execute({ ...dto, tenantId: this.ctx.tenantId })
      .catch(mapPlatformError);
  }

  @Post('images/read-signed-url')
  @HttpCode(HttpStatus.CREATED)
  generateImageReadSignedUrl(
    @Body(new ZodValidationPipe(GenerateHotsiteImageReadSignedUrlSchema))
    dto: GenerateHotsiteImageReadSignedUrlDto,
  ): Promise<GenerateHotsiteImageReadSignedUrlUseCaseResult> {
    return this.generateHotsiteImageReadSignedUrl
      .execute({ ...dto, tenantId: this.ctx.tenantId })
      .catch(mapPlatformError);
  }

  @Post('gallery/feature-booking-photo')
  @HttpCode(HttpStatus.CREATED)
  featureBookingPhoto(
    @Body(new ZodValidationPipe(FeatureBookingPhotoSchema)) dto: FeatureBookingPhotoDto,
  ): Promise<FeatureBookingPhotoUseCaseResult> {
    return this.featureHotsiteBookingPhoto
      .execute({ ...dto, tenantId: this.ctx.tenantId })
      .catch(mapPlatformError);
  }

  @Post('images/delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteImage(
    @Body(new ZodValidationPipe(DeleteHotsiteImageSchema)) dto: DeleteHotsiteImageDto,
  ): Promise<void> {
    return this.deleteHotsiteImage
      .execute({ ...dto, tenantId: this.ctx.tenantId })
      .catch(mapPlatformError);
  }
}
