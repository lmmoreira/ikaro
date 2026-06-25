export interface SwitchTenantRequest {
  readonly targetTenantId: string;
}

export interface SwitchTenantResponse {
  readonly tenantSlug: string;
  readonly expiresIn: string;
}

export interface TenantOption {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly loyaltyPoints: number;
}
