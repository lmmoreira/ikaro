import { z } from 'zod';
import {
  BookingModelSchema,
  ClassResourceSlotSchema as ClassResourceSlotBodySchema,
  ResourceRequirementSchema as ResourceRequirementBodySchema,
  ServiceLegSchema as ServiceLegBodySchema,
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
// pattern in resource.schemas.ts).
export {
  BookingModelSchema,
  ClassResourceSlotBodySchema,
  ResourceRequirementBodySchema,
  ServiceLegBodySchema,
  UpdateServiceLegsBodySchema,
  UpdateServiceResourceRequirementsBodySchema,
};

export const CreateServiceBodySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  priceAmount: z.number().positive(),
  durationMinutes: z.number().int().positive(),
  loyaltyPointsValue: z.number().int().min(0),
  requiresPickupAddress: z.boolean().optional(),
  isActive: z.boolean().optional(),
  bookingModel: BookingModelSchema.optional(),
  classResourceSlots: z.array(ClassResourceSlotBodySchema).optional(),
});

export const UpdateServiceBodySchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    priceAmount: z.number().positive().optional(),
    durationMinutes: z.number().int().positive().optional(),
    loyaltyPointsValue: z.number().int().min(0).optional(),
    requiresPickupAddress: z.boolean().optional(),
    bufferAfterMinutes: z.number().int().optional(),
    bookingModel: BookingModelSchema.optional(),
  })
  .default({});

export type CreateServiceBody = z.infer<typeof CreateServiceBodySchema>;
export type UpdateServiceBody = z.infer<typeof UpdateServiceBodySchema>;
export type UpdateServiceResourceRequirementsBody = z.infer<
  typeof UpdateServiceResourceRequirementsBodySchema
>;
export type UpdateServiceLegsBody = z.infer<typeof UpdateServiceLegsBodySchema>;
