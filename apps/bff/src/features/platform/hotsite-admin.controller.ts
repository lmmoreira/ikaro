import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import { ZodValidationPipe } from '@ikaro/nestjs-http';
import { Roles } from '../../shared/decorators/roles.decorator';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import {
  FeatureBookingPhotoResponse,
  GenerateHotsiteImageReadSignedUrlResponse,
  GenerateHotsiteImageSignedUrlResponse,
  HotsiteAdminContentResponse,
  PublishHotsiteResponse,
  UnpublishHotsiteResponse,
} from '@ikaro/types';
import {
  DeleteHotsiteImageBody,
  DeleteHotsiteImageBodySchema,
  FeatureBookingPhotoBody,
  FeatureBookingPhotoBodySchema,
  GenerateHotsiteImageReadSignedUrlBody,
  GenerateHotsiteImageReadSignedUrlBodySchema,
  GenerateHotsiteImageSignedUrlBody,
  GenerateHotsiteImageSignedUrlBodySchema,
  UpdateHotsiteContentBody,
  UpdateHotsiteContentBodySchema,
} from './hotsite-admin.schemas';

// Request Zod schemas moved to hotsite-admin.schemas.ts (TD37-S10) — re-exported here so
// existing imports of these symbols from this file keep working unchanged.
export * from './hotsite-admin.schemas';

@Controller('tenants/hotsite')
@Roles('MANAGER')
export class HotsiteAdminController {
  constructor(private readonly backendHttp: BackendHttpService) {}

  @Get()
  getContent(): Promise<HotsiteAdminContentResponse> {
    return this.backendHttp.get<HotsiteAdminContentResponse>('/tenants/hotsite');
  }

  @Patch()
  @HttpCode(HttpStatus.OK)
  updateContent(
    @Body(new ZodValidationPipe(UpdateHotsiteContentBodySchema)) body: UpdateHotsiteContentBody,
  ): Promise<HotsiteAdminContentResponse> {
    return this.backendHttp.patch<HotsiteAdminContentResponse>('/tenants/hotsite', body);
  }

  @Post('publish')
  @HttpCode(HttpStatus.OK)
  publish(): Promise<PublishHotsiteResponse> {
    return this.backendHttp.post<PublishHotsiteResponse>('/tenants/hotsite/publish', {});
  }

  @Post('unpublish')
  @HttpCode(HttpStatus.OK)
  unpublish(): Promise<UnpublishHotsiteResponse> {
    return this.backendHttp.post<UnpublishHotsiteResponse>('/tenants/hotsite/unpublish', {});
  }

  @Post('images/signed-url')
  @HttpCode(HttpStatus.CREATED)
  generateImageSignedUrl(
    @Body(new ZodValidationPipe(GenerateHotsiteImageSignedUrlBodySchema))
    body: GenerateHotsiteImageSignedUrlBody,
  ): Promise<GenerateHotsiteImageSignedUrlResponse> {
    return this.backendHttp.post<GenerateHotsiteImageSignedUrlResponse>(
      '/tenants/hotsite/images/signed-url',
      body,
    );
  }

  @Post('images/read-signed-url')
  @HttpCode(HttpStatus.CREATED)
  generateImageReadSignedUrl(
    @Body(new ZodValidationPipe(GenerateHotsiteImageReadSignedUrlBodySchema))
    body: GenerateHotsiteImageReadSignedUrlBody,
  ): Promise<GenerateHotsiteImageReadSignedUrlResponse> {
    return this.backendHttp.post<GenerateHotsiteImageReadSignedUrlResponse>(
      '/tenants/hotsite/images/read-signed-url',
      body,
    );
  }

  @Post('gallery/feature-booking-photo')
  @HttpCode(HttpStatus.CREATED)
  featureBookingPhoto(
    @Body(new ZodValidationPipe(FeatureBookingPhotoBodySchema)) body: FeatureBookingPhotoBody,
  ): Promise<FeatureBookingPhotoResponse> {
    return this.backendHttp.post<FeatureBookingPhotoResponse>(
      '/tenants/hotsite/gallery/feature-booking-photo',
      body,
    );
  }

  @Post('images/delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteImage(
    @Body(new ZodValidationPipe(DeleteHotsiteImageBodySchema)) body: DeleteHotsiteImageBody,
  ): Promise<void> {
    return this.backendHttp.post<void>('/tenants/hotsite/images/delete', body);
  }
}
