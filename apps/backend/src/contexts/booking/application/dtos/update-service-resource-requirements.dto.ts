import { z } from 'zod';
import { UpdateServiceResourceRequirementsSchema } from '@ikaro/validation';

export { UpdateServiceResourceRequirementsSchema };

export type UpdateServiceResourceRequirementsDto = z.infer<
  typeof UpdateServiceResourceRequirementsSchema
>;
