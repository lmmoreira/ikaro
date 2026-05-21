import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { ServiceEntity } from '../../../contexts/booking/infrastructure/entities/service.entity';

export class ServiceEntityBuilder {
  private id = uuidv7();
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private name = 'Lavagem Simples';
  private description: string | null = null;
  private priceAmount = '100.00';
  private durationMinutes = 30;
  private loyaltyPointsValue = 5;
  private requiresPickupAddress = false;
  private isActive = true;
  private readonly createdAt = new Date('2026-01-01T00:00:00Z');
  private readonly updatedAt = new Date('2026-01-01T00:00:00Z');

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withName(name: string): this {
    this.name = name;
    return this;
  }

  withDescription(description: string | null): this {
    this.description = description;
    return this;
  }

  withPriceAmount(priceAmount: string): this {
    this.priceAmount = priceAmount;
    return this;
  }

  withDurationMinutes(durationMinutes: number): this {
    this.durationMinutes = durationMinutes;
    return this;
  }

  withLoyaltyPointsValue(loyaltyPointsValue: number): this {
    this.loyaltyPointsValue = loyaltyPointsValue;
    return this;
  }

  withRequiresPickupAddress(requiresPickupAddress: boolean): this {
    this.requiresPickupAddress = requiresPickupAddress;
    return this;
  }

  withIsActive(isActive: boolean): this {
    this.isActive = isActive;
    return this;
  }

  build(): ServiceEntity {
    const e = new ServiceEntity();
    e.id = this.id;
    e.tenantId = this.tenantId;
    e.name = this.name;
    e.description = this.description;
    e.priceAmount = this.priceAmount;
    e.durationMinutes = this.durationMinutes;
    e.loyaltyPointsValue = this.loyaltyPointsValue;
    e.requiresPickupAddress = this.requiresPickupAddress;
    e.isActive = this.isActive;
    e.createdAt = this.createdAt;
    e.updatedAt = this.updatedAt;
    return e;
  }
}
