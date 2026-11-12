import type { FeatureKey } from '@ikaro/validation';
import type { TenantAccess, TenantAccessPort } from '../../shared/ports/tenant-access.port';

const ALL_FEATURES: TenantAccess['features'] = [
  { key: 'HOTSITE', tier: 'STANDARD' },
  { key: 'BOOKING', tier: 'STANDARD' },
  { key: 'LOYALTY', tier: 'STANDARD' },
  { key: 'CHATBOT', tier: 'BASIC' },
  { key: 'LEAD_FORM', tier: 'STANDARD' },
];

// The `TenantAccessPort` double the other contexts' specs use. A tenant nobody seeded is
// operational with every feature, so a spec only seeds the case it is about (a suspended tenant,
// a tenant without one feature).
export class InMemoryTenantAccessPort implements TenantAccessPort {
  private readonly byTenant = new Map<string, TenantAccess>();
  private suspendedIds: string[] = [];
  private notEntitledIds = new Map<FeatureKey, string[]>();
  // State-based replacement for a jest.fn() call-count assertion.
  readonly getAccessCalls: string[] = [];

  seed(tenantId: string, access: TenantAccess): void {
    this.byTenant.set(tenantId, access);
  }

  seedSuspended(tenantId: string): void {
    this.byTenant.set(tenantId, {
      status: 'SUSPENDED',
      suspensionReason: 'NON_PAYMENT',
      operational: false,
      features: [],
    });
    this.suspendedIds.push(tenantId);
  }

  seedNotEntitledTo(feature: FeatureKey, tenantIds: string[]): void {
    this.notEntitledIds.set(feature, tenantIds);
  }

  async getAccess(tenantId: string): Promise<TenantAccess> {
    this.getAccessCalls.push(tenantId);
    return (
      this.byTenant.get(tenantId) ?? {
        status: 'ACTIVE',
        suspensionReason: null,
        operational: true,
        features: [...ALL_FEATURES],
      }
    );
  }

  async listSuspendedTenantIds(): Promise<string[]> {
    return [...this.suspendedIds];
  }

  async findTenantIdsNotEntitledTo(feature: FeatureKey): Promise<string[]> {
    return [...(this.notEntitledIds.get(feature) ?? [])];
  }
}
