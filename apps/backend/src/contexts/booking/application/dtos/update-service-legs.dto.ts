import { z } from 'zod';
import { UpdateServiceLegsSchema } from '@ikaro/validation';

export { UpdateServiceLegsSchema };

export type UpdateServiceLegsDto = z.infer<typeof UpdateServiceLegsSchema>;
