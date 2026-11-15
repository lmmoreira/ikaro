import { TenantExpiryPauseEntity } from '../../../contexts/loyalty/infrastructure/entities/tenant-expiry-pause.entity';
import { uuidv7 } from '../../../shared/domain/uuid-v7';

export class TenantExpiryPauseEntityBuilder {
  private tenantId = uuidv7();
  private pausedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  private resumedAt: Date | null = null;

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withPausedAt(pausedAt: Date): this {
    this.pausedAt = pausedAt;
    return this;
  }

  withResumedAt(resumedAt: Date | null): this {
    this.resumedAt = resumedAt;
    return this;
  }

  build(): TenantExpiryPauseEntity {
    const entity = new TenantExpiryPauseEntity();
    entity.tenantId = this.tenantId;
    entity.pausedAt = this.pausedAt;
    entity.resumedAt = this.resumedAt;
    return entity;
  }
}
