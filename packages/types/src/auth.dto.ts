export interface TokenResponse {
  accessToken: string;
  expiresIn: number;
}

export interface TenantSelectionItem {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  logoUrl?: string;
}

export interface SwitchTenantRequest {
  tenantId: string;
}
