import { SubscriptionItemEntity } from '../../../contexts/billing/infrastructure/entities/subscription-item.entity';
import { uuidv7 } from '../../../shared/domain/uuid-v7';

const DAY_MS = 24 * 60 * 60 * 1000;

export class SubscriptionItemEntityBuilder {
  private id = uuidv7();
  private tenantId = uuidv7();
  private subscriptionId = uuidv7();
  private featureKey = 'HOTSITE';
  private tier = 'STANDARD';
  private startsAt = new Date(Date.now() - DAY_MS);
  private endsAt: Date | null = null;
  private createdBy = 'SYSTEM';

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withSubscriptionId(subscriptionId: string): this {
    this.subscriptionId = subscriptionId;
    return this;
  }

  withFeatureKey(featureKey: string): this {
    this.featureKey = featureKey;
    return this;
  }

  withTier(tier: string): this {
    this.tier = tier;
    return this;
  }

  withStartsAt(startsAt: Date): this {
    this.startsAt = startsAt;
    return this;
  }

  withEndsAt(endsAt: Date | null): this {
    this.endsAt = endsAt;
    return this;
  }

  withCreatedBy(createdBy: string): this {
    this.createdBy = createdBy;
    return this;
  }

  build(): SubscriptionItemEntity {
    const e = new SubscriptionItemEntity();
    e.id = this.id;
    e.tenantId = this.tenantId;
    e.subscriptionId = this.subscriptionId;
    e.featureKey = this.featureKey;
    e.tier = this.tier;
    e.startsAt = this.startsAt;
    e.endsAt = this.endsAt;
    e.createdBy = this.createdBy;
    return e;
  }
}
