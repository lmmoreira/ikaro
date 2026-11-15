import { Inject, Injectable } from '@nestjs/common';
import { effectiveExpiry } from '../../domain/effective-expiry';
import type { LoyaltyEntry } from '../../domain/loyalty-entry.aggregate';
import {
  ITenantExpiryPauseRepository,
  TENANT_EXPIRY_PAUSE_REPOSITORY,
} from '../ports/tenant-expiry-pause-repository.port';

/**
 * Applies the tenants' suspension pauses to loyalty entries (M25-S27, UC-121 O-L1). One ledger
 * read per call, whatever the number of entries; the entries themselves are never changed.
 */
@Injectable()
export class EntryEffectiveExpiryService {
  constructor(
    @Inject(TENANT_EXPIRY_PAUSE_REPOSITORY)
    private readonly pauseRepo: ITenantExpiryPauseRepository,
  ) {}

  /** Entry id → effective expiry; `null` while an open pause holds the entry. */
  async resolve(entries: readonly LoyaltyEntry[]): Promise<Map<string, Date | null>> {
    const resolved = new Map<string, Date | null>();
    if (entries.length === 0) return resolved;

    const tenantIds = [...new Set(entries.map((e) => e.tenantId))];
    const pausesByTenant = await this.pauseRepo.findByTenantIds(tenantIds);
    for (const entry of entries) {
      resolved.set(entry.id, effectiveExpiry(entry, pausesByTenant.get(entry.tenantId) ?? []));
    }
    return resolved;
  }
}
