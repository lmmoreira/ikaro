import { z } from 'zod';
import { BookingModelSchema, ClassResourceSlotSchema } from '@ikaro/validation';

export const UpdateServiceSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    priceAmount: z.number().positive().optional(),
    durationMinutes: z.number().int().positive().optional(),
    loyaltyPointsValue: z.number().int().min(0).optional(),
    requiresPickupAddress: z.boolean().optional(),
    // Disabled once the service has legs (UC-053 A1) — enforced by the aggregate, not here.
    // Non-negative to match settings.serviceBufferMinutes's own >= 0 bound
    // (docs/21-TENANTS_SETTINGS_SCHEMA.md) — a negative buffer has no real meaning for UC-059's
    // max(bufferAfterMinutes, turnoverMinutes) availability formula.
    bufferAfterMinutes: z.number().int().nonnegative().optional(),
    // Immutable once the service has booking history (UC-056 A1) — enforced by the aggregate.
    bookingModel: BookingModelSchema.optional(),
    // Only meaningful (and required) when this same request converts bookingModel to SESSION —
    // enforced by the aggregate (Service.changeBookingModel()), not here. There is no separate
    // slot-management endpoint this milestone, so a SESSION conversion must supply its slots in
    // the same request.
    classResourceSlots: z.array(ClassResourceSlotSchema).max(20).optional(),
  })
  .default({});

export type UpdateServiceDto = z.infer<typeof UpdateServiceSchema>;
