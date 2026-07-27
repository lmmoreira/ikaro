export interface SwitchTenantRequest {
  readonly targetTenantId: string;
}

// GET /auth/session — the actor's own staff-or-customer identity, whichever matches the JWT's
// role (the two are mutually exclusive by construction, so exactly one is ever non-null).
export interface SessionResponse {
  readonly staff: { readonly id: string; readonly name: string | null } | null;
  readonly customer: { readonly customerId: string; readonly name: string } | null;
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
