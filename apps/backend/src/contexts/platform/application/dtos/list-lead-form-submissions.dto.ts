import { z } from 'zod';
import { ListLeadFormSubmissionsSchema } from '@ikaro/validation';

export { ListLeadFormSubmissionsSchema };
export type ListLeadFormSubmissionsDto = z.infer<typeof ListLeadFormSubmissionsSchema>;
