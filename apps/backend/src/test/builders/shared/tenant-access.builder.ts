import type {
  TenantAccess,
  TenantAccessFeature,
  TenantAccessStatus,
  TenantAccessSuspensionReason,
  TenantAccessTier,
} from '../../../shared/ports/tenant-access.port';

// What `TenantAccessPort.getAccess()` answers for a tenant: an operational tenant with the hotsite
// and the chatbot at BASIC unless a spec says otherwise. `operational` always follows `status`.
export class TenantAccessBuilder {
  private status: TenantAccessStatus = 'ACTIVE';
  private suspensionReason: TenantAccessSuspensionReason | null = null;
  private features: TenantAccessFeature[] = [
    { key: 'HOTSITE', tier: 'STANDARD' },
    { key: 'CHATBOT', tier: 'BASIC' },
  ];
  private degraded = false;

  withStatus(status: TenantAccessStatus): this {
    this.status = status;
    return this;
  }

  withSuspension(reason: TenantAccessSuspensionReason = 'NON_PAYMENT'): this {
    this.status = 'SUSPENDED';
    this.suspensionReason = reason;
    return this;
  }

  withChatbotTier(tier: TenantAccessTier): this {
    this.features = [
      ...this.features.filter((feature) => feature.key !== 'CHATBOT'),
      { key: 'CHATBOT', tier },
    ];
    return this;
  }

  withoutChatbot(): this {
    this.features = this.features.filter((feature) => feature.key !== 'CHATBOT');
    return this;
  }

  // The fail-open answer after a lookup error (`degraded`, never cached).
  withDegraded(): this {
    this.degraded = true;
    return this;
  }

  build(): TenantAccess {
    return {
      status: this.status,
      suspensionReason: this.suspensionReason,
      operational: this.status !== 'SUSPENDED',
      features: [...this.features],
      ...(this.degraded ? { degraded: true as const } : {}),
    };
  }
}
