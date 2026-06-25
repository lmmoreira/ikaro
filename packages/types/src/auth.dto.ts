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

export interface StaffTenantOption {
  readonly staffId: string;
  readonly tenantId: string;
  readonly tenantSlug: string;
  readonly tenantName: string;
  readonly role: 'STAFF' | 'MANAGER';
}
