import { HotsiteConfig } from '../../domain/hotsite-config.aggregate';

export const HOTSITE_CONFIG_REPOSITORY = Symbol('IHotsiteConfigRepository');

export interface IHotsiteConfigRepository {
  findByTenantId(tenantId: string): Promise<HotsiteConfig | null>;
  save(config: HotsiteConfig): Promise<void>;
}
