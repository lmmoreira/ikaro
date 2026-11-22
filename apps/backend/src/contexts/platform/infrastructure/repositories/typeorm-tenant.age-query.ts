import { Repository, SelectQueryBuilder } from 'typeorm';
import type { TenantAgeCursor } from '../../application/ports/tenant-repository.port';
import { TenantEntity } from '../entities/tenant.entity';

// The tenants created before a cutoff, oldest first (UC-140, M26-S08), as a keyset page: the
// `(created_at, id)` tuple comparison and the same two-column order are served by the standalone
// `IDX_platform_tenants_created_at (created_at, id)` index, so a page never re-reads the rows before
// its cursor. Exported so the integration spec can `EXPLAIN` the exact SQL that runs.
export function buildTenantsCreatedBeforeQuery(
  repo: Repository<TenantEntity>,
  cutoff: Date,
  limit: number,
  after?: TenantAgeCursor,
): SelectQueryBuilder<TenantEntity> {
  const query = repo
    .createQueryBuilder('tenant')
    .where('tenant.createdAt < :cutoff', { cutoff })
    .orderBy('tenant.createdAt', 'ASC')
    .addOrderBy('tenant.id', 'ASC')
    .limit(limit);
  if (after) {
    query.andWhere('(tenant.createdAt, tenant.id) > (:afterCreatedAt, :afterId)', {
      afterCreatedAt: after.createdAt,
      afterId: after.id,
    });
  }
  return query;
}
