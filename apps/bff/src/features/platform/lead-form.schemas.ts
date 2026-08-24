import { z } from 'zod';
import { UpdateLeadFormConfigSchema } from '@ikaro/validation';

export const UpdateLeadFormConfigBodySchema = UpdateLeadFormConfigSchema;
export type UpdateLeadFormConfigBody = z.infer<typeof UpdateLeadFormConfigBodySchema>;
