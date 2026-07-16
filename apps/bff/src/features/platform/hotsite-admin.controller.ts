import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '@ikaro/nestjs-http';
import { Roles } from '../../shared/decorators/roles.decorator';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import {
  FeatureBookingPhotoResponse,
  GenerateHotsiteImageReadSignedUrlResponse,
  GenerateHotsiteImageSignedUrlResponse,
  GenericErrorCode,
  HexColorErrorCode,
  HotsiteAdminContentResponse,
  PlatformErrorCode,
  PublishHotsiteResponse,
  SeoErrorCode,
  UnpublishHotsiteResponse,
} from '@ikaro/types';

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;
const hexColorField = (): z.ZodString =>
  z.string().refine((v) => HEX_COLOR_REGEX.test(v), {
    error: 'must be a valid hex color (e.g. #FF5733)',
    params: { code: HexColorErrorCode.FORMAT_INVALID },
  });
// tmp/<tenantId>/<purpose>/<uuid>/<fileName> — hotsite uploads only. One segment longer than
// booking's tmp/<tenantId>/<uuid>/<fileName>; without the extra segment, a booking tmp/ upload
// could be accepted by a hotsite endpoint and promoted into the public hotsite bucket (or
// deleted from the private bucket) instead of being rejected. Shared across every hotsite tmp/
// path field in this file so the shape only needs to change in one place.
const HOTSITE_TMP_PATH_FRAGMENT = 'tmp/[^/]+/[^/]+/[^/]+/[^/]+';
// Accepts empty (to clear), an already-permanent hotsite image, or a not-yet-promoted tmp/
// staging upload — see td/TD22-ORPHANED-UPLOAD-CLEANUP.md.
const LOGO_URL_REGEX = new RegExp(`^$|^tenants/[^/]+/hotsite/.+$|^${HOTSITE_TMP_PATH_FRAGMENT}$`);
const LOGO_URL_MESSAGE = {
  message:
    'logoUrl must be empty (to clear), a tenants/<id>/hotsite/... storage path, or a tmp/<id>/... staging path',
};

const HotsiteBrandingBodySchema = z
  .object({
    primaryColor: hexColorField(),
    secondaryColor: hexColorField(),
    backgroundColor: hexColorField(),
    textColor: hexColorField(),
    headingFontFamily: z.string().min(1),
    bodyFontFamily: z.string().min(1),
    logoUrl: z.string().regex(LOGO_URL_REGEX, LOGO_URL_MESSAGE),
    borderRadius: z.enum(['sharp', 'rounded', 'pill']),
    buttonStyle: z.enum(['filled', 'outline', 'ghost']),
    spacing: z.enum(['compact', 'comfortable', 'spacious']),
    shadowStyle: z.enum(['none', 'subtle', 'strong']),
    buttonBackgroundColor: hexColorField(),
    buttonTextColor: hexColorField(),
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

// Keep in sync with SeoTitle.MAX_LENGTH / SeoDescription.MAX_LENGTH in
// apps/backend/src/shared/value-objects/seo-title.vo.ts and seo-description.vo.ts — the BFF
// keeps its own independent copy of this limit rather than importing the backend VO (same
// convention as this file's hex-color regex), so a future change to either constant must be
// applied here too.
const HotsiteSeoBodySchema = z
  .object({
    title: z
      .string()
      .refine((v) => v.length <= 60, {
        error: 'must be at most 60 characters',
        params: { code: SeoErrorCode.TITLE_TOO_LONG },
      })
      .nullable(),
    description: z
      .string()
      .refine((v) => v.length <= 158, {
        error: 'must be at most 158 characters',
        params: { code: SeoErrorCode.DESCRIPTION_TOO_LONG },
      })
      .nullable(),
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
