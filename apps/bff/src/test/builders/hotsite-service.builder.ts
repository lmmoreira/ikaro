import { HotsiteServiceBookingPolicy, HotsiteServiceResponse } from '@ikaro/types';

export class HotsiteServiceBuilder {
  private id = '10000000-0000-4000-8000-000000000001';
  private name = 'Lavagem Completa';
  private isActive = true;
  private bookingPolicy: HotsiteServiceBookingPolicy = {
    durationPolicy: 'FIXED',
    durationMinMinutes: null,
    durationMaxMinutes: null,
    durationIncrementMinutes: null,
    pricingPolicy: 'FIXED',
    pricingIncrementMinutes: null,
    pricePerIncrementAmount: null,
    minimumChargeAmount: null,
    recurrenceEligible: false,
    recurringHorizonDays: null,
  };

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withName(name: string): this {
    this.name = name;
    return this;
  }

  withIsActive(isActive: boolean): this {
    this.isActive = isActive;
    return this;
  }

  withBookingPolicy(bookingPolicy: Partial<HotsiteServiceBookingPolicy>): this {
    this.bookingPolicy = { ...this.bookingPolicy, ...bookingPolicy };
    return this;
  }

  build(): HotsiteServiceResponse {
    return {
      id: this.id,
      name: this.name,
      description: null,
      price: { amount: 150, currency: 'BRL', formatted: 'R$ 150,00' },
      durationMinutes: 60,
      loyaltyPointsValue: 10,
      requiresPickupAddress: false,
      isActive: this.isActive,
      createdAt: '2026-01-01T00:00:00.000Z',
      bookingModel: 'APPOINTMENT',
      resourceRequirements: [{ type: 'LOCATION', selectionMode: 'NONE', requiredQuantity: 1 }],
      legs: null,
      bookingPolicy: { ...this.bookingPolicy },
    };
  }
}
