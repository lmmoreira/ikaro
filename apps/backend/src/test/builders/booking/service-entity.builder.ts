import { uuidv7 } from '../../../shared/domain/uuid-v7';
import {
  ServiceApprovalMode,
  ServiceBookingModel,
  ServiceDurationPolicy,
  ServicePricingPolicy,
} from '../../../contexts/booking/domain/service.aggregate';
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
  private bookingModel: ServiceBookingModel = 'APPOINTMENT';
  private bufferAfterMinutes: number | null = 60;
  private defaultApprovalMode: ServiceApprovalMode | null = null;
  private manualHoldMinutes: number | null = null;
  private cancellationWindowHoursOverride: number | null = null;
  private rescheduleWindowHoursOverride: number | null = null;
  private minBookingAdvanceHoursOverride: number | null = null;
  private maxBookingAdvanceDaysOverride: number | null = null;
  private recurrenceEligible = false;
  private availabilityAlertEligible = false;
  private durationPolicy: ServiceDurationPolicy = 'FIXED';
  private durationMinMinutes: number | null = null;
  private durationMaxMinutes: number | null = null;
  private durationIncrementMinutes: number | null = null;
  private pricingPolicy: ServicePricingPolicy = 'FIXED';
  private pricingIncrementMinutes: number | null = null;
  private pricePerIncrementAmount: string | null = null;
  private minimumChargeAmount: string | null = null;

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

  withBookingModel(bookingModel: ServiceBookingModel): this {
    this.bookingModel = bookingModel;
    return this;
  }

  withBufferAfterMinutes(bufferAfterMinutes: number | null): this {
    this.bufferAfterMinutes = bufferAfterMinutes;
    return this;
  }

  withDefaultApprovalMode(defaultApprovalMode: ServiceApprovalMode | null): this {
    this.defaultApprovalMode = defaultApprovalMode;
    return this;
  }

  withDurationPolicy(durationPolicy: ServiceDurationPolicy): this {
    this.durationPolicy = durationPolicy;
    return this;
  }

  withPricingPolicy(pricingPolicy: ServicePricingPolicy): this {
    this.pricingPolicy = pricingPolicy;
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
    e.bookingModel = this.bookingModel;
    e.bufferAfterMinutes = this.bufferAfterMinutes;
    e.defaultApprovalMode = this.defaultApprovalMode;
    e.manualHoldMinutes = this.manualHoldMinutes;
    e.cancellationWindowHoursOverride = this.cancellationWindowHoursOverride;
    e.rescheduleWindowHoursOverride = this.rescheduleWindowHoursOverride;
    e.minBookingAdvanceHoursOverride = this.minBookingAdvanceHoursOverride;
    e.maxBookingAdvanceDaysOverride = this.maxBookingAdvanceDaysOverride;
    e.recurrenceEligible = this.recurrenceEligible;
    e.availabilityAlertEligible = this.availabilityAlertEligible;
    e.durationPolicy = this.durationPolicy;
    e.durationMinMinutes = this.durationMinMinutes;
    e.durationMaxMinutes = this.durationMaxMinutes;
    e.durationIncrementMinutes = this.durationIncrementMinutes;
    e.pricingPolicy = this.pricingPolicy;
    e.pricingIncrementMinutes = this.pricingIncrementMinutes;
    e.pricePerIncrementAmount = this.pricePerIncrementAmount;
    e.minimumChargeAmount = this.minimumChargeAmount;
    return e;
  }
}
