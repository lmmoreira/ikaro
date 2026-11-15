import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, InsertQueryBuilder, Repository } from 'typeorm';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { ITenantExpiryPauseRepository } from '../../application/ports/tenant-expiry-pause-repository.port';
import type { ExpiryPause } from '../../domain/effective-expiry';
import { TenantExpiryPauseEntity } from '../entities/tenant-expiry-pause.entity';

@Injectable()
export class TypeOrmTenantExpiryPauseRepository implements ITenantExpiryPauseRepository {
  constructor(
    @InjectRepository(TenantExpiryPauseEntity)
    private readonly repo: Repository<TenantExpiryPauseEntity>,
  ) {}

  async recordOpen(tenantId: string, pausedAt: Date): Promise<void> {
    await this.insertBuilder().values({ tenantId, pausedAt, resumedAt: null }).orIgnore().execute();
  }

  async recordClosed(tenantId: string, pausedAt: Date, resumedAt: Date): Promise<void> {
    await this.insertBuilder()
      .values({ tenantId, pausedAt, resumedAt })
      .orUpdate(['resumed_at'], ['tenant_id', 'paused_at'])
      .execute();
  }

  async findByTenantIds(tenantIds: readonly string[]): Promise<Map<string, ExpiryPause[]>> {
    const byTenant = new Map<string, ExpiryPause[]>();
    if (tenantIds.length === 0) return byTenant;

    const rows = await this.repo.find({ where: { tenantId: In([...tenantIds]) } });
    for (const row of rows) {
      const pauses = byTenant.get(row.tenantId) ?? [];
      pauses.push({ pausedAt: row.pausedAt, resumedAt: row.resumedAt });
      byTenant.set(row.tenantId, pauses);
    }
    return byTenant;
  }

  private insertBuilder(): InsertQueryBuilder<TenantExpiryPauseEntity> {
    const manager = getActiveEntityManager();
    const repo = manager ? manager.getRepository(TenantExpiryPauseEntity) : this.repo;
    return repo.createQueryBuilder().insert().into(TenantExpiryPauseEntity);
  }
}
