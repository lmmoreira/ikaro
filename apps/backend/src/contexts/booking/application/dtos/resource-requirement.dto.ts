import { z } from 'zod';
import { ClassResourceSlot } from '../../domain/class-resource-slot';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import { ServiceLeg } from '../../domain/service-leg';

// Shared by create-service/update-service (flat requirement), update-service-resource-requirements,
// and update-service-legs (nested per-leg requirements) — one Zod shape, not four independent copies.
export const ResourceRequirementSchema = z.object({
  type: z.enum(['LOCATION', 'STAFF', 'ROOM', 'EQUIPMENT']),
  selectionMode: z.enum(['NONE', 'CUSTOMER_CHOICE', 'AUTO_ANY', 'AUTO_FUNGIBLE_POOL']),
  resourcePoolIds: z.array(z.uuid()).nullable().optional(),
  requiredQuantity: z.number().int().positive().optional(),
});

export const ServiceLegSchema = z.object({
  legIndex: z.number().int().min(0),
  name: z.string().min(1),
  durationMinutes: z.number().int().positive(),
  resourceRequirements: z.array(ResourceRequirementSchema).min(1),
  transitionGapAfterMinutes: z.number().int().min(0).optional(),
});

export const ClassResourceSlotSchema = z.object({
  type: z.enum(['LOCATION', 'STAFF', 'ROOM', 'EQUIPMENT']),
  eligibleResourceIds: z.array(z.uuid()),
});

export type ResourceRequirementDto = z.infer<typeof ResourceRequirementSchema>;
export type ServiceLegDto = z.infer<typeof ServiceLegSchema>;
export type ClassResourceSlotDto = z.infer<typeof ClassResourceSlotSchema>;

// dto.type is the Zod schema's plain string-literal union — TS string enums are nominally
// typed, so a validated literal needs this explicit bridge to the domain's ResourceType enum
// (same pattern as CreateResourceUseCase's own input.type cast).
export function toResourceRequirement(dto: ResourceRequirementDto): ResourceRequirement {
  return ResourceRequirement.create({ ...dto, type: dto.type as ResourceType });
}

export function toServiceLeg(dto: ServiceLegDto): ServiceLeg {
  return ServiceLeg.create({
    ...dto,
    resourceRequirements: dto.resourceRequirements.map(toResourceRequirement),
  });
}

export function toClassResourceSlot(dto: ClassResourceSlotDto): ClassResourceSlot {
  return ClassResourceSlot.create({ ...dto, type: dto.type as ResourceType });
}
