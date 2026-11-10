import { FeaturePriceVersionEntity } from '../../../contexts/billing/infrastructure/entities/feature-price-version.entity';
import { uuidv7 } from '../../../shared/domain/uuid-v7';

export class FeaturePriceVersionEntityBuilder {
  private id = uuidv7();
  private featurePriceId = uuidv7();
  private amountMinor = 4900;
  private effectiveFrom = '2026-01-01';
  private announcedAt: Date | null = null;
  private createdBy = 'SYSTEM';
  private reason = 'Initial catalog (M25-S02)';
  private supersededAt: Date | null = null;
  private batchId: string | null = null;

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withFeaturePriceId(featurePriceId: string): this {
    this.featurePriceId = featurePriceId;
    return this;
  }

  withAmountMinor(amountMinor: number): this {
    this.amountMinor = amountMinor;
    return this;
  }

  withEffectiveFrom(effectiveFrom: string): this {
    this.effectiveFrom = effectiveFrom;
    return this;
  }

  withSupersededAt(supersededAt: Date | null): this {
    this.supersededAt = supersededAt;
    return this;
  }

  withReason(reason: string): this {
    this.reason = reason;
    return this;
  }

  build(): FeaturePriceVersionEntity {
    const e = new FeaturePriceVersionEntity();
    e.id = this.id;
    e.featurePriceId = this.featurePriceId;
    e.amountMinor = this.amountMinor;
    e.effectiveFrom = this.effectiveFrom;
    e.announcedAt = this.announcedAt;
    e.createdBy = this.createdBy;
    e.reason = this.reason;
    e.supersededAt = this.supersededAt;
    e.batchId = this.batchId;
    return e;
  }
}
