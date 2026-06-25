import { Staff } from '../../domain/staff.aggregate';

export const STAFF_REPOSITORY = Symbol('IStaffRepository');

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
  findAllByTenant(tenantId: string, limit: number, offset: number): Promise<FindAllByTenantResult>;
  countActiveManagersByTenant(tenantId: string): Promise<number>;
  save(staff: Staff): Promise<void>;
}
