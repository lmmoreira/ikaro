import { z } from 'zod';
import { UpdateLeadFormConfigSchema } from '@ikaro/validation';

export { UpdateLeadFormConfigSchema };
export type UpdateLeadFormConfigDto = z.infer<typeof UpdateLeadFormConfigSchema>;
