export interface CustomerTenantSummaryResponse {
  tenantId: string;
  customerId: string;
}

export interface FindOrCreateCustomerResponse {
  customerId: string;
  created: boolean;
}

export interface StaffInfoResponse {
  staffId: string;
  tenantId: string;
  role: 'STAFF' | 'MANAGER';
  isActive: boolean;
}

export interface StaffByEmailResponse {
  staffId: string;
  email: string;
  role: 'STAFF' | 'MANAGER';
  isActive: boolean;
}

export interface ActivateStaffResponse {
  staffId: string;
  tenantId: string;
  role: 'STAFF' | 'MANAGER';
  isActive: true;
}
