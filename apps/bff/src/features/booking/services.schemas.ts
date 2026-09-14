import { z } from 'zod';

// Request Zod schemas and their inferred body types — split out of services.controller.ts so
// request-side shapes never live inline in the controller (mirrors
// booking/bookings.schemas.ts's existing split).

// Shared by create/update (flat requirement) and the two new resource-requirements/legs
// actions — one Zod shape, matching the backend's own resource-requirement.dto.ts.
export const ResourceRequirementBodySchema = z.object({
  type: z.enum(['LOCATION', 'STAFF', 'ROOM', 'EQUIPMENT']),
  selectionMode: z.enum(['NONE', 'CUSTOMER_CHOICE', 'AUTO_ANY', 'AUTO_FUNGIBLE_POOL']),
  resourcePoolIds: z.array(z.uuid()).nullable().optional(),
  requiredQuantity: z.number().int().positive().optional(),
});

export const ServiceLegBodySchema = z.object({
  legIndex: z.number().int().min(0),
  name: z.string().min(1),
  durationMinutes: z.number().int().positive(),
  resourceRequirements: z.array(ResourceRequirementBodySchema).min(1),
  transitionGapAfterMinutes: z.number().int().min(0).optional(),
});

export const ClassResourceSlotBodySchema = z.object({
  type: z.enum(['LOCATION', 'STAFF', 'ROOM', 'EQUIPMENT']),
  eligibleResourceIds: z.array(z.uuid()),
});

export const CreateServiceBodySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  priceAmount: z.number().positive(),
  durationMinutes: z.number().int().positive(),
  loyaltyPointsValue: z.number().int().min(0),
  requiresPickupAddress: z.boolean().optional(),
  isActive: z.boolean().optional(),
  bookingModel: z.enum(['APPOINTMENT', 'SESSION']).optional(),
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
    bookingModel: z.enum(['APPOINTMENT', 'SESSION']).optional(),
  })
  .default({});

// No .min(2) here on purpose — see the backend's own update-service-legs.dto.ts note: the
// "fewer than 2 legs" rejection is a domain-level 422, not a generic Zod 400.
export const UpdateServiceResourceRequirementsBodySchema = z.object({
  resourceRequirements: z.array(ResourceRequirementBodySchema).min(1),
});

export const UpdateServiceLegsBodySchema = z.object({
  legs: z.array(ServiceLegBodySchema),
});

export type CreateServiceBody = z.infer<typeof CreateServiceBodySchema>;
export type UpdateServiceBody = z.infer<typeof UpdateServiceBodySchema>;
export type UpdateServiceResourceRequirementsBody = z.infer<
  typeof UpdateServiceResourceRequirementsBodySchema
>;
export type UpdateServiceLegsBody = z.infer<typeof UpdateServiceLegsBodySchema>;
