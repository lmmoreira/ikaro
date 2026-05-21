import { Service } from '../../../contexts/booking/domain/service.aggregate';
import { Money } from '../../../shared/value-objects/money';

export class ServiceBuilder {
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private name = 'Lavagem Simples';
  private price = Money.from(100, 'BRL');
  private durationMinutes = 30;
  private loyaltyPointsValue = 5;
  private requiresPickupAddress = false;
  private description: string | undefined = undefined;

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withName(name: string): this {
    this.name = name;
    return this;
  }

  withPrice(price: Money): this {
    this.price = price;
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

  withDescription(description: string): this {
    this.description = description;
    return this;
  }

  build(): Service {
    return Service.create(
      this.tenantId,
      this.name,
      this.price,
      this.durationMinutes,
      this.loyaltyPointsValue,
      this.requiresPickupAddress,
      this.description,
    );
  }
}
