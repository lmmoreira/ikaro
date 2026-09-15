import { z } from 'zod';
import { UpdateServiceBookingPolicySchema } from '@ikaro/validation';

export { UpdateServiceBookingPolicySchema };

export type UpdateServiceBookingPolicyDto = z.infer<typeof UpdateServiceBookingPolicySchema>;
