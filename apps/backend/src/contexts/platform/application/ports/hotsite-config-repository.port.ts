import { HotsiteConfig, HotsiteModuleType } from '../../domain/hotsite-config.aggregate';

export const HOTSITE_CONFIG_REPOSITORY = Symbol('IHotsiteConfigRepository');

export interface IHotsiteConfigRepository {
  findByTenantId(tenantId: string): Promise<HotsiteConfig | null>;
  findByTenantIds(tenantIds: string[]): Promise<HotsiteConfig[]>;
  save(config: HotsiteConfig): Promise<void>;
  // Narrow projection of a single layout[] entry's enabled flag — kept as its own port method
  // (rather than making every caller load+scan the full aggregate) specifically so the caching
  // decorator can cache this cheaply without touching the much larger findByTenantId/findByTenantIds
  // read paths, which the admin editor and public manifest both need fully fresh. Returns null
  // (not false) when the tenant has no HotsiteConfig row at all, so callers can distinguish
  // "not found" from "found but disabled" (M20-S10 follow-up).
  isModuleEnabled(tenantId: string, moduleType: HotsiteModuleType): Promise<boolean | null>;
}
