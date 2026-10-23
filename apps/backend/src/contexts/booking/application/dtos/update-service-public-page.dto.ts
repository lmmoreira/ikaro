import { z } from 'zod';
import { UpdateServicePublicPageSchema } from '@ikaro/validation';

export { UpdateServicePublicPageSchema };

export type UpdateServicePublicPageDto = z.infer<typeof UpdateServicePublicPageSchema>;
