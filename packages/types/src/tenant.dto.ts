import type { HotsiteModuleType } from './enums';

export interface BusinessHours {
  open: string; // "HH:MM"
  close: string; // "HH:MM"
  closed: boolean;
}

export interface TenantSettings {
  timezone: string;
  booking: {
    cancellationWindowHours: number;
    maxAdvanceBookingDays: number;
  };
  loyalty: {
    expiryDays: number;
  };
  businessHours: {
    monday: BusinessHours;
    tuesday: BusinessHours;
    wednesday: BusinessHours;
    thursday: BusinessHours;
    friday: BusinessHours;
    saturday: BusinessHours;
    sunday: BusinessHours;
  };
}

export interface UpdateTenantSettingsRequest {
  settings: Partial<TenantSettings>;
}

export interface HotsiteModule {
  type: HotsiteModuleType;
  order: number;
  visible: boolean;
  config?: Record<string, unknown>;
}

export interface HotsiteConfigResponse {
  id: string;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  logoUrl?: string;
  primaryColor?: string;
  modules: HotsiteModule[];
  isPublished: boolean;
  updatedAt: string;
}

export interface UpdateHotsiteRequest {
  tenantName?: string;
  logoUrl?: string;
  primaryColor?: string;
  modules?: HotsiteModule[];
  isPublished?: boolean;
}

export interface TenantManifestResponse {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  logoUrl?: string;
  primaryColor?: string;
  modules: HotsiteModule[];
}
