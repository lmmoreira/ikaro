import { Staff, StaffRole } from '../../domain/staff.aggregate';

export const STAFF_REPOSITORY = Symbol('IStaffRepository');

export type StaffStatusFilter = 'ACTIVE' | 'DEACTIVATED' | 'ANY';

export interface StaffFilters {
  ids?: string[];
  roles?: StaffRole[];
  status?: StaffStatusFilter;
  search?: string;
  limit: number;
  offset: number;
}

export interface FindAllByTenantResult {
  items: Staff[];
  total: number;
}

export interface IStaffRepository {
  findByTenantAndOAuthId(tenantId: string, googleOAuthId: string): Promise<Staff | null>;
  findAllByGoogleOAuthId(googleOAuthId: string): Promise<Staff[]>;
  findByTenantAndEmail(tenantId: string, email: string): Promise<Staff | null>;
  findAllByEmail(email: string): Promise<Staff[]>;
  findById(id: string, tenantId: string): Promise<Staff | null>;
  findAllByTenant(tenantId: string, filters: StaffFilters): Promise<FindAllByTenantResult>;
  countActiveManagersByTenant(tenantId: string): Promise<number>;
  save(staff: Staff): Promise<void>;
}
