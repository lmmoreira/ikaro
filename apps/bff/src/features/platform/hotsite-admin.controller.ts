import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe';
import { Roles } from '../../shared/decorators/roles.decorator';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import {
  FeatureBookingPhotoResponse,
  GenerateHotsiteImageSignedUrlResponse,
  HotsiteAdminContentResponse,
  PublishHotsiteResponse,
  UnpublishHotsiteResponse,
} from '@ikaro/types';

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;
const LOGO_URL_REGEX = /^$|^tenants\/[^/]+\/hotsite\/.+$/;
const LOGO_URL_MESSAGE = {
  message: 'logoUrl must be empty (to clear) or a tenants/<id>/hotsite/... storage path',
};

const HotsiteBrandingBodySchema = z
  .object({
    primaryColor: z.string().regex(HEX_COLOR_REGEX),
    secondaryColor: z.string().regex(HEX_COLOR_REGEX),
    backgroundColor: z.string().regex(HEX_COLOR_REGEX),
    textColor: z.string().regex(HEX_COLOR_REGEX),
    headingFontFamily: z.string().min(1),
    bodyFontFamily: z.string().min(1),
    logoUrl: z.string().regex(LOGO_URL_REGEX, LOGO_URL_MESSAGE),
    borderRadius: z.enum(['sharp', 'rounded', 'pill']),
    buttonStyle: z.enum(['filled', 'outline', 'ghost']),
    spacing: z.enum(['compact', 'comfortable', 'spacious']),
    shadowStyle: z.enum(['none', 'subtle', 'strong']),
    buttonBackgroundColor: z.string().regex(HEX_COLOR_REGEX),
    buttonTextColor: z.string().regex(HEX_COLOR_REGEX),
    heroBgStyle: z.enum(['primary', 'background']),
    alternateSectionBg: z.boolean(),
    dividerStyle: z.enum(['none', 'gradient', 'solid']),
    brandName: z.string().max(100),
    brandTagline: z.string().max(200),
  })
  .partial();

const HotsiteModuleBodySchema = z.object({
  type: z.enum([
    'HERO',
    'SERVICE_LIST',
    'GALLERY',
    'TESTIMONIALS',
    'BOOKING_CTA',
    'ABOUT',
    'CONTACT',
    'FOOTER',
  ]),
  enabled: z.boolean(),
  data: z.record(z.string(), z.unknown()),
});

const HotsiteSeoBodySchema = z
  .object({
    title: z.string().max(60).nullable(),
    description: z.string().max(158).nullable(),
  })
  .partial();

export const UpdateHotsiteContentBodySchema = z
  .object({
    branding: HotsiteBrandingBodySchema.optional(),
    layout: z.array(HotsiteModuleBodySchema).optional(),
    seo: HotsiteSeoBodySchema.optional(),
  })
  .refine(
    (data) => data.branding !== undefined || data.layout !== undefined || data.seo !== undefined,
    { message: 'at least one of branding, layout, or seo must be provided' },
  )
  .default({});

type UpdateHotsiteContentBody = z.infer<typeof UpdateHotsiteContentBodySchema>;

export const GenerateHotsiteImageSignedUrlBodySchema = z.object({
  fileName: z
    .string()
    .min(1)
    .max(255)
    .refine((v) => !v.includes('/') && !v.includes('..'), {
      message: 'fileName must not contain path separators or ".."',
    }),
  contentType: z.enum(['image/jpeg', 'image/png']),
  purpose: z.enum(['branding', 'hero', 'gallery', 'about', 'booking-cta', 'testimonials']),
});

type GenerateHotsiteImageSignedUrlBody = z.infer<typeof GenerateHotsiteImageSignedUrlBodySchema>;

export const FeatureBookingPhotoBodySchema = z
  .object({
    bookingId: z.uuid(),
    filePath: z.string().regex(/^tenants\/[^/]+\/bookings\/[^/]+\/.+$/),
    photoType: z.enum(['before', 'after']),
  })
  .refine((data) => data.filePath.includes(`/bookings/${data.bookingId}/`), {
    message: 'filePath must belong to the provided bookingId',
  });

type FeatureBookingPhotoBody = z.infer<typeof FeatureBookingPhotoBodySchema>;

export const DeleteHotsiteImageBodySchema = z.object({
  filePath: z.string().regex(/^tenants\/[^/]+\/hotsite\/.+$/),
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
