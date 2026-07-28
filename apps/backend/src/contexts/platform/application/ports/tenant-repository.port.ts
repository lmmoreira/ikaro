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
  /**
   * Locking read for cross-aggregate invariants that validate against tenant settings inside a
   * write transaction (e.g. HotsiteConfig's carouselDays vs. maxBookingAdvanceDays check). Must
   * be called inside `ITransactionManager.run()` — the row lock is only meaningful within an
   * active transaction, and is released when that transaction commits or rolls back.
   */
  findByIdForUpdate(id: string): Promise<Tenant | null>;
  findByIds(ids: string[]): Promise<Tenant[]>;
  findMany(filters?: TenantFilters): Promise<Tenant[]>;
  findAllActive(): Promise<Tenant[]>;
  save(tenant: Tenant): Promise<void>;
  existsBySlug(slug: string): Promise<boolean>;
}
