import type {
  HotsiteAdminContentResponse,
  PublishHotsiteResponse,
  UnpublishHotsiteResponse,
  GenerateHotsiteImageSignedUrlResponse,
  FeatureBookingPhotoResponse,
  TenantSettingsResponse,
  UpdateTenantSettingsRequest,
  RenameTenantRequest,
  RenameTenantResponse,
} from '@ikaro/types';
import { bffClient } from '@/shared/lib/api/bff-client';
export {
  resolveTenantFormatting,
  resolveWelcomeStaffScreenDays,
  type TenantFormattingConfig,
} from '../model/tenant-settings';

export interface UpdateHotsiteModuleRequest {
  readonly type: string;
  readonly enabled: boolean;
  readonly data: Record<string, unknown>;
}

export interface UpdateHotsiteBrandingRequest {
  readonly primaryColor?: string;
  readonly secondaryColor?: string;
  readonly backgroundColor?: string;
  readonly textColor?: string;
  readonly headingFontFamily?: string;
  readonly bodyFontFamily?: string;
  readonly logoUrl?: string;
  readonly borderRadius?: 'sharp' | 'rounded' | 'pill';
  readonly buttonStyle?: 'filled' | 'outline' | 'ghost';
  readonly spacing?: 'compact' | 'comfortable' | 'spacious';
  readonly shadowStyle?: 'none' | 'subtle' | 'strong';
  readonly buttonBackgroundColor?: string;
  readonly buttonTextColor?: string;
  readonly heroBgStyle?: 'primary' | 'background';
  readonly alternateSectionBg?: boolean;
  readonly dividerStyle?: 'none' | 'gradient' | 'solid';
  readonly brandName?: string;
  readonly brandTagline?: string;
}

export interface UpdateHotsiteRequest {
  readonly branding?: UpdateHotsiteBrandingRequest;
  readonly layout?: readonly UpdateHotsiteModuleRequest[];
  readonly seo?: {
    readonly title?: string | null;
    readonly description?: string | null;
  };
}

export interface HotsiteImageSignedUrlRequest {
  readonly fileName: string;
  readonly contentType: 'image/jpeg' | 'image/png';
  readonly purpose: 'branding' | 'hero' | 'gallery' | 'about' | 'booking-cta' | 'testimonials';
}

export interface FeatureBookingPhotoRequest {
  readonly bookingId: string;
  readonly photoType: 'before' | 'after';
  readonly filePath: string;
}

export async function getHotsiteConfig(): Promise<HotsiteAdminContentResponse> {
  const res = await bffClient.get<HotsiteAdminContentResponse>('/tenants/hotsite');
  return res.data;
}

export async function updateHotsiteConfig(
  body: UpdateHotsiteRequest,
): Promise<HotsiteAdminContentResponse> {
  const res = await bffClient.patch<HotsiteAdminContentResponse>('/tenants/hotsite', body);
  return res.data;
}

export async function publishHotsite(): Promise<PublishHotsiteResponse> {
  const res = await bffClient.post<PublishHotsiteResponse>('/tenants/hotsite/publish', {});
  return res.data;
}

export async function unpublishHotsite(): Promise<UnpublishHotsiteResponse> {
  const res = await bffClient.post<UnpublishHotsiteResponse>('/tenants/hotsite/unpublish', {});
  return res.data;
}

export async function generateHotsiteImageSignedUrl(
  body: HotsiteImageSignedUrlRequest,
): Promise<GenerateHotsiteImageSignedUrlResponse> {
  const res = await bffClient.post<GenerateHotsiteImageSignedUrlResponse>(
    '/tenants/hotsite/images/signed-url',
    body,
  );
  return res.data;
}

export async function featureBookingPhoto(
  body: FeatureBookingPhotoRequest,
): Promise<FeatureBookingPhotoResponse> {
  const res = await bffClient.post<FeatureBookingPhotoResponse>(
    '/tenants/hotsite/gallery/feature-booking-photo',
    body,
  );
  return res.data;
}

export async function deleteHotsiteImage(filePath: string): Promise<void> {
  await bffClient.post('/tenants/hotsite/images/delete', { filePath });
}

export async function updateTenantSettings(
  body: UpdateTenantSettingsRequest,
): Promise<TenantSettingsResponse> {
  const res = await bffClient.patch<TenantSettingsResponse>('/tenants/settings', body);
  return res.data;
}

// Tenant rename is a separate endpoint — PATCH /tenants/settings has a strict schema
// that rejects `name` (see M13-S31 discovery note in plan/M13-DASHBOARD-FRONTEND.md).
export async function renameTenant(body: RenameTenantRequest): Promise<RenameTenantResponse> {
  const res = await bffClient.patch<RenameTenantResponse>('/tenants', body);
  return res.data;
}
