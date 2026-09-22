import { IHotsiteConfigRepository } from '../../../contexts/platform/application/ports/hotsite-config-repository.port';
import {
  HotsiteConfig,
  HotsiteModuleType,
} from '../../../contexts/platform/domain/hotsite-config.aggregate';

export class InMemoryHotsiteConfigRepository implements IHotsiteConfigRepository {
  private readonly store = new Map<string, HotsiteConfig>();

  async findByTenantId(tenantId: string): Promise<HotsiteConfig | null> {
    return this.store.get(tenantId) ?? null;
  }

  async findByTenantIds(tenantIds: string[]): Promise<HotsiteConfig[]> {
    return tenantIds.flatMap((tenantId) => {
      const config = this.store.get(tenantId);
      return config ? [config] : [];
    });
  }

  async save(config: HotsiteConfig): Promise<void> {
    this.store.set(config.tenantId, config);
  }

  async isModuleEnabled(tenantId: string, moduleType: HotsiteModuleType): Promise<boolean | null> {
    const config = this.store.get(tenantId);
    if (!config) return null;
    return config.layout.find((module) => module.type === moduleType)?.enabled ?? false;
  }
}
