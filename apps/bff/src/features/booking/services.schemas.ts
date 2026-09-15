import { z } from 'zod';
import {
  BookingModelSchema,
  ClassResourceSlotSchema as ClassResourceSlotBodySchema,
  PublishServiceIntakeSchemaSchema as PublishServiceIntakeSchemaBodySchema,
  UpdateServiceBookingPolicySchema as UpdateServiceBookingPolicyBodySchema,
  UpdateServiceLegsSchema as UpdateServiceLegsBodySchema,
  UpdateServiceResourceRequirementsSchema as UpdateServiceResourceRequirementsBodySchema,
} from '@ikaro/validation';

// Request Zod schemas and their inferred body types — split out of services.controller.ts so
// request-side shapes never live inline in the controller (mirrors
// booking/bookings.schemas.ts's existing split).

// ResourceRequirementBodySchema/ServiceLegBodySchema/ClassResourceSlotBodySchema/
// UpdateServiceResourceRequirementsBodySchema/UpdateServiceLegsBodySchema/BookingModelSchema
// are shared with the backend's identical resource-requirement.dto.ts /
// update-service-resource-requirements.dto.ts / update-service-legs.dto.ts schemas via
// @ikaro/validation (no per-app deviation — mirrors CreateResourceSchema's own direct-reuse
// pattern in resource.schemas.ts). BookingModelSchema/ClassResourceSlotBodySchema/
// UpdateServiceLegsBodySchema/UpdateServiceResourceRequirementsBodySchema are also used locally
// below, so they stay as regular imports re-exported here; ResourceRequirementBodySchema/
// ServiceLegBodySchema are pure passthroughs with no local use, so they re-export directly.
export {
  BookingModelSchema,
  ClassResourceSlotBodySchema,
  PublishServiceIntakeSchemaBodySchema,
  UpdateServiceBookingPolicyBodySchema,
  UpdateServiceLegsBodySchema,
  UpdateServiceResourceRequirementsBodySchema,
};
export {
  ResourceRequirementSchema as ResourceRequirementBodySchema,
  ServiceLegSchema as ServiceLegBodySchema,
} from '@ikaro/validation';

export const CreateServiceBodySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  priceAmount: z.number().positive(),
  durationMinutes: z.number().int().positive(),
  loyaltyPointsValue: z.number().int().min(0),
  requiresPickupAddress: z.boolean().optional(),
  isActive: z.boolean().optional(),
  bookingModel: BookingModelSchema.optional(),
  // Max mirrors the backend's identical bound (create-service.dto.ts).
  classResourceSlots: z.array(ClassResourceSlotBodySchema).max(20).optional(),
});

export const UpdateServiceBodySchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    priceAmount: z.number().positive().optional(),
    durationMinutes: z.number().int().positive().optional(),
    loyaltyPointsValue: z.number().int().min(0).optional(),
    requiresPickupAddress: z.boolean().optional(),
    // Non-negative to match the backend's identical bound (update-service.dto.ts) — see that
    // file's comment for the settings.serviceBufferMinutes/UC-059 rationale.
    bufferAfterMinutes: z.number().int().nonnegative().optional(),
    bookingModel: BookingModelSchema.optional(),
    // Only meaningful (and required) when this same request converts bookingModel to SESSION —
    // mirrors the backend's identical bound (update-service.dto.ts).
    classResourceSlots: z.array(ClassResourceSlotBodySchema).max(20).optional(),
  })
  .default({});

export type CreateServiceBody = z.infer<typeof CreateServiceBodySchema>;
export type UpdateServiceBody = z.infer<typeof UpdateServiceBodySchema>;
export type UpdateServiceResourceRequirementsBody = z.infer<
  typeof UpdateServiceResourceRequirementsBodySchema
>;
export type UpdateServiceLegsBody = z.infer<typeof UpdateServiceLegsBodySchema>;
export type UpdateServiceBookingPolicyBody = z.infer<typeof UpdateServiceBookingPolicyBodySchema>;
export type PublishServiceIntakeSchemaBody = z.infer<typeof PublishServiceIntakeSchemaBodySchema>;
