import { z } from 'zod';
import { ResourceRequirementSchema } from './resource-requirement.dto';

export const UpdateServiceResourceRequirementsSchema = z.object({
  resourceRequirements: z.array(ResourceRequirementSchema).min(1),
});

export type UpdateServiceResourceRequirementsDto = z.infer<
  typeof UpdateServiceResourceRequirementsSchema
>;
