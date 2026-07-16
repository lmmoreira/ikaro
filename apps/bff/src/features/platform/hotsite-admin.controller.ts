import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '@ikaro/nestjs-http';
import {
  HOTSITE_TMP_PATH_FRAGMENT,
  HotsiteBrandingSchema,
  HotsiteModuleSchema,
  HotsiteSeoSchema,
} from '@ikaro/validation';
import { Roles } from '../../shared/decorators/roles.decorator';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import {
  FeatureBookingPhotoResponse,
  GenerateHotsiteImageReadSignedUrlResponse,
  GenerateHotsiteImageSignedUrlResponse,
  GenericErrorCode,
  HotsiteAdminContentResponse,
  PlatformErrorCode,
  PublishHotsiteResponse,
  UnpublishHotsiteResponse,
} from '@ikaro/types';

export const UpdateHotsiteContentBodySchema = z
  .object({
    branding: HotsiteBrandingSchema.optional(),
    layout: z.array(HotsiteModuleSchema).optional(),
    seo: HotsiteSeoSchema.optional(),
  })
  .refine(
    (data) => data.branding !== undefined || data.layout !== undefined || data.seo !== undefined,
    {
      error: 'at least one of branding, layout, or seo must be provided',
      params: { code: PlatformErrorCode.HOTSITE_UPDATE_EMPTY },
    },
  )
  .default({});

type UpdateHotsiteContentBody = z.infer<typeof UpdateHotsiteContentBodySchema>;

export const GenerateHotsiteImageSignedUrlBodySchema = z.object({
  fileName: z
    .string()
    .min(1)
    .max(255)
    .refine((v) => !v.includes('/') && !v.includes('..'), {
      error: 'fileName must not contain path separators or ".."',
      params: { code: GenericErrorCode.FORMAT_INVALID },
    }),
  contentType: z.enum(['image/jpeg', 'image/png']),
  purpose: z.enum(['branding', 'hero', 'gallery', 'about', 'booking-cta', 'testimonials']),
});

type GenerateHotsiteImageSignedUrlBody = z.infer<typeof GenerateHotsiteImageSignedUrlBodySchema>;

// Only for not-yet-promoted tmp/ staging uploads — an already-permanent tenants/.../hotsite/...
// image resolves via the pure getPublicUrl() string template instead (see
// td/TD22-ORPHANED-UPLOAD-CLEANUP.md § tmp/ image preview).
export const GenerateHotsiteImageReadSignedUrlBodySchema = z.object({
  filePath: z.string().regex(new RegExp(`^${HOTSITE_TMP_PATH_FRAGMENT}$`)),
});

type GenerateHotsiteImageReadSignedUrlBody = z.infer<
  typeof GenerateHotsiteImageReadSignedUrlBodySchema
>;

export const FeatureBookingPhotoBodySchema = z
  .object({
    bookingId: z.uuid(),
    filePath: z.string().regex(/^tenants\/[^/]+\/bookings\/[^/]+\/.+$/),
    photoType: z.enum(['before', 'after']),
  })
  .refine((data) => data.filePath.includes(`/bookings/${data.bookingId}/`), {
    error: 'filePath must belong to the provided bookingId',
    params: { code: PlatformErrorCode.FEATURED_PHOTO_PATH_MISMATCH },
  });

type FeatureBookingPhotoBody = z.infer<typeof FeatureBookingPhotoBodySchema>;

// Accepts either an already-permanent hotsite image (tenants/<id>/hotsite/...) or a not-yet
// promoted tmp/ staging upload (tmp/<id>/...) — see td/TD22-ORPHANED-UPLOAD-CLEANUP.md.
export const DeleteHotsiteImageBodySchema = z.object({
  filePath: z
    .string()
    .regex(new RegExp(`^(tenants/[^/]+/hotsite/.+|${HOTSITE_TMP_PATH_FRAGMENT})$`)),
});

type DeleteHotsiteImageBody = z.infer<typeof DeleteHotsiteImageBodySchema>;

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
