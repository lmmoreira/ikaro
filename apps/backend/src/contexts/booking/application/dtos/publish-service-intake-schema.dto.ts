import { z } from 'zod';
import { PublishServiceIntakeSchemaSchema } from '@ikaro/validation';

export { PublishServiceIntakeSchemaSchema };

export type PublishServiceIntakeSchemaDto = z.infer<typeof PublishServiceIntakeSchemaSchema>;
