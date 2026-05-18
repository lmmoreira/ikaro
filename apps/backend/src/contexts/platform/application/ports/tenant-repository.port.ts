import { Tenant } from '../../domain/tenant.aggregate';

export const TENANT_REPOSITORY = Symbol('ITenantRepository');

export interface ITenantRepository {
  findBySlug(slug: string): Promise<Tenant | null>;
  findById(id: string): Promise<Tenant | null>;
  findByIds(ids: string[]): Promise<Tenant[]>;
  save(tenant: Tenant): Promise<void>;
  existsBySlug(slug: string): Promise<boolean>;
}
