import { Tenant } from '../../domain/tenant.aggregate';

export const TENANT_REPOSITORY = Symbol('ITenantRepository');

export type TenantStatusFilter = 'ACTIVE' | 'INACTIVE' | 'ANY';

export interface TenantFilters {
  ids?: string[];
  status?: TenantStatusFilter;
  name?: string;
  slug?: string;
  limit?: number;
  offset?: number;
}

export interface ITenantRepository {
  findBySlug(slug: string): Promise<Tenant | null>;
  findById(id: string): Promise<Tenant | null>;
  findByIds(ids: string[]): Promise<Tenant[]>;
  findMany(filters?: TenantFilters): Promise<Tenant[]>;
  findAllActive(): Promise<Tenant[]>;
  save(tenant: Tenant): Promise<void>;
  existsBySlug(slug: string): Promise<boolean>;
}
