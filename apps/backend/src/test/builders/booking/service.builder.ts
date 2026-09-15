import { Service, ServiceBookingModel } from '../../../contexts/booking/domain/service.aggregate';
import { ClassResourceSlot } from '../../../contexts/booking/domain/class-resource-slot';
import { ResourceRequirement } from '../../../contexts/booking/domain/resource-requirement';
import { ServiceLeg } from '../../../contexts/booking/domain/service-leg';
import { Money } from '../../../shared/value-objects/money';
import { uuidv7 } from '../../../shared/domain/uuid-v7';

export class ServiceBuilder {
  private readonly id = uuidv7();
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private name = 'Lavagem Simples';
  private price = Money.from(100, 'BRL');
  private durationMinutes = 30;
  private loyaltyPointsValue = 5;
  private requiresPickupAddress = false;
  private description: string | undefined = undefined;
  private isActive = true;
  private bookingModel: ServiceBookingModel = 'APPOINTMENT';
  private resourceRequirements: ResourceRequirement[] = [];
  private bufferAfterMinutes: number | null = 60;
  private legs: ServiceLeg[] | null = null;
  private classResourceSlots: ClassResourceSlot[] | null = null;

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

  withIsActive(isActive: boolean): this {
    this.isActive = isActive;
    return this;
  }

  withBookingModel(bookingModel: ServiceBookingModel): this {
    this.bookingModel = bookingModel;
    return this;
  }

  withResourceRequirements(resourceRequirements: ResourceRequirement[]): this {
    this.resourceRequirements = resourceRequirements;
    return this;
  }

  withBufferAfterMinutes(bufferAfterMinutes: number | null): this {
    this.bufferAfterMinutes = bufferAfterMinutes;
    return this;
  }

  withLegs(legs: ServiceLeg[] | null): this {
    this.legs = legs;
    return this;
  }

  withClassResourceSlots(classResourceSlots: ClassResourceSlot[] | null): this {
    this.classResourceSlots = classResourceSlots;
    return this;
  }

  // Simulates an already-persisted row (Service.reconstitute()) — a test that needs
  // resourceRequirements/legs/classResourceSlots actually written to the DB on save() must call
  // the matching setter (setResourceRequirements()/setLegs()) on the built instance first, the
  // same way production code does; the repository only re-syncs child tables when one of those
  // setters (or changeBookingModel()) was actually called (see typeorm-service.repository.ts).
  build(): Service {
    return Service.reconstitute({
      id: this.id,
      tenantId: this.tenantId,
      name: this.name,
      price: this.price,
      durationMinutes: this.durationMinutes,
      loyaltyPointsValue: this.loyaltyPointsValue,
      requiresPickupAddress: this.requiresPickupAddress,
      description: this.description ?? null,
      isActive: this.isActive,
      createdAt: new Date(),
      updatedAt: new Date(),
      bookingModel: this.bookingModel,
      resourceRequirements: this.resourceRequirements,
      bufferAfterMinutes: this.bufferAfterMinutes,
      legs: this.legs,
      classResourceSlots: this.classResourceSlots,
    });
  }
}
