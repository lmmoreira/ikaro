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

/** The keyset position of a tenant in the `(created_at, id)` order: the last row of the previous page. */
export interface TenantAgeCursor {
  createdAt: Date;
  id: string;
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
  /**
   * A keyset page of the tenants created strictly before `cutoff`, oldest first (`created_at ASC,
   * id ASC`), starting after `after` when given. Both active and inactive tenants are returned.
   * Served by the standalone `(created_at)` index (the cross-tenant self-heal job, M26-S08).
   */
  findCreatedBefore(cutoff: Date, limit: number, after?: TenantAgeCursor): Promise<Tenant[]>;
  save(tenant: Tenant): Promise<void>;
  existsBySlug(slug: string): Promise<boolean>;
}
