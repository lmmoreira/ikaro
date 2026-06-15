import { HotsiteConfig } from '../../domain/hotsite-config.aggregate';

export const HOTSITE_CONFIG_REPOSITORY = Symbol('IHotsiteConfigRepository');

export interface IHotsiteConfigRepository {
  findByTenantId(tenantId: string): Promise<HotsiteConfig | null>;
  findByTenantIds(tenantIds: string[]): Promise<HotsiteConfig[]>;
  save(config: HotsiteConfig): Promise<void>;
}
