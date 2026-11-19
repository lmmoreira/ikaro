import { ChargeLineEntity } from '../../../contexts/billing/infrastructure/entities/charge-line.entity';
import { uuidv7 } from '../../../shared/domain/uuid-v7';

export class ChargeLineEntityBuilder {
  private id = uuidv7();
  private tenantId = uuidv7();
  private chargeId = uuidv7();
  private featureKey = 'HOTSITE';
  private tier = 'STANDARD';
  private unitPriceMinor = '4900';

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withChargeId(chargeId: string): this {
    this.chargeId = chargeId;
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

  withUnitPriceMinor(unitPriceMinor: number): this {
    this.unitPriceMinor = String(unitPriceMinor);
    return this;
  }

  build(): ChargeLineEntity {
    const e = new ChargeLineEntity();
    e.id = this.id;
    e.tenantId = this.tenantId;
    e.chargeId = this.chargeId;
    e.featureKey = this.featureKey;
    e.tier = this.tier;
    e.unitPriceMinor = this.unitPriceMinor;
    return e;
  }
}
