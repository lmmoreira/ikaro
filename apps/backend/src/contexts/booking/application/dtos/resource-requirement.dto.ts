import { z } from 'zod';
import {
  ClassResourceSlotSchema,
  ResourceRequirementSchema,
  ServiceLegSchema,
} from '@ikaro/validation';
import { ClassResourceSlot } from '../../domain/class-resource-slot';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import { ServiceLeg } from '../../domain/service-leg';

// Shared by create-service/update-service (flat requirement), update-service-resource-requirements,
// and update-service-legs (nested per-leg requirements) — one Zod shape, not four independent
// copies, and shared with the BFF's identical services.schemas.ts shapes via @ikaro/validation
// (no per-app deviation — mirrors CreateResourceSchema's own direct-reuse pattern).
export { ClassResourceSlotSchema, ResourceRequirementSchema, ServiceLegSchema };

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
