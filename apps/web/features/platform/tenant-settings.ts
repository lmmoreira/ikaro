import type {
  HotsiteAdminContentResponse,
  PublishHotsiteResponse,
  UnpublishHotsiteResponse,
  GenerateHotsiteImageSignedUrlResponse,
  FeatureBookingPhotoResponse,
  TenantSettingsResponse,
} from '@ikaro/types';
import { countrySpec } from '@ikaro/i18n';
import type { DateFormat } from '@ikaro/i18n';
import { bffClient } from '@/shared/lib/api/bff-client';
import { bffServerFetch } from '@/shared/lib/api/bff-server';

export interface TenantFormattingConfig {
  readonly locale: string;
  readonly currency: string;
  readonly currencySymbol?: string;
  readonly timezone: string;
  readonly dateFormat: DateFormat;
  readonly timeFormat: '24h' | '12h';
}

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
  readonly modules?: readonly UpdateHotsiteModuleRequest[];
  readonly seo?: {
    readonly title?: string | null;
    readonly description?: string | null;
  };
}

export interface HotsiteImageSignedUrlRequest {
  readonly fileName: string;
  readonly contentType: 'image/jpeg' | 'image/png';
}

export interface FeatureBookingPhotoRequest {
  readonly bookingId: string;
  readonly photoType: 'before' | 'after';
  readonly filePath: string;
}

export async function getHotsiteConfig(): Promise<HotsiteAdminContentResponse> {
  const res = await bffClient.get<HotsiteAdminContentResponse>('/platform/hotsite');
  return res.data;
}

export async function updateHotsiteConfig(
  body: UpdateHotsiteRequest,
): Promise<HotsiteAdminContentResponse> {
  const res = await bffClient.patch<HotsiteAdminContentResponse>('/platform/hotsite', body);
  return res.data;
}

export async function publishHotsite(): Promise<PublishHotsiteResponse> {
  const res = await bffClient.post<PublishHotsiteResponse>('/platform/hotsite/publish', {});
  return res.data;
}

export async function unpublishHotsite(): Promise<UnpublishHotsiteResponse> {
  const res = await bffClient.post<UnpublishHotsiteResponse>('/platform/hotsite/unpublish', {});
  return res.data;
}

export async function generateHotsiteImageSignedUrl(
  body: HotsiteImageSignedUrlRequest,
): Promise<GenerateHotsiteImageSignedUrlResponse> {
  const res = await bffClient.post<GenerateHotsiteImageSignedUrlResponse>(
    '/platform/hotsite/images/signed-url',
    body,
  );
  return res.data;
}

export async function featureBookingPhoto(
  body: FeatureBookingPhotoRequest,
): Promise<FeatureBookingPhotoResponse> {
  const res = await bffClient.post<FeatureBookingPhotoResponse>(
    '/platform/hotsite/gallery/feature-booking-photo',
    body,
  );
  return res.data;
}

// Server-side only — reads the auth cookie directly (called from layout server components).
export async function fetchTenantSettings(token: string): Promise<TenantSettingsResponse> {
  const res = await bffServerFetch(token, '/tenants/settings', {
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`Failed to fetch tenant settings (${res.status})`);
  return res.json() as Promise<TenantSettingsResponse>;
}

export function resolveTenantFormatting(tenant: TenantSettingsResponse): TenantFormattingConfig {
  const spec = countrySpec(tenant.settings.localization.countryCode);
  return {
    locale: tenant.settings.localization.language,
    currency: tenant.settings.localization.currency,
    currencySymbol: tenant.settings.localization.currencySymbol,
    timezone: tenant.settings.businessHours.timezone,
    dateFormat: spec.dateFormat,
    timeFormat: spec.timeFormat,
  };
}

export function resolveWelcomeStaffScreenDays(tenant: TenantSettingsResponse): number {
  return tenant.settings.booking.welcomeStaffScreenDays ?? 14;
}
