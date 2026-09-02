import { z } from 'zod';
import { CreateResourceSchema, UpdateResourceSchema } from '@ikaro/validation';
import { ResourceType } from '../../domain/resource.types';

export { CreateResourceSchema, UpdateResourceSchema };

export type CreateResourceDto = z.infer<typeof CreateResourceSchema>;
export type UpdateResourceDto = z.infer<typeof UpdateResourceSchema>;

export const ListResourcesSchema = z.object({
  type: z
    .enum([ResourceType.LOCATION, ResourceType.STAFF, ResourceType.ROOM, ResourceType.EQUIPMENT])
    .optional(),
  // .optional() must come AFTER .transform() — chaining it before wraps the schema in
  // ZodEffects, which z.object() no longer recognizes as an optional key, making `isActive`
  // a required `boolean | undefined` property instead of a genuinely optional one.
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export type ListResourcesDto = z.infer<typeof ListResourcesSchema>;
