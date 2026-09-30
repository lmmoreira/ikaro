import { z } from 'zod';
import {
  DismissSchedulingExceptionsBodySchema as DismissSchedulingExceptionsSchema,
  ListSchedulingExceptionsQuerySchema as ListSchedulingExceptionsSchema,
  ResolveSchedulingExceptionsBodySchema as ResolveSchedulingExceptionsSchema,
} from '@ikaro/validation';

// The backend controller and the BFF take identical bodies, so the schemas live once in
// packages/validation/src/scheduling-exception.ts.
export {
  DismissSchedulingExceptionsSchema,
  ListSchedulingExceptionsSchema,
  ResolveSchedulingExceptionsSchema,
};

export type ListSchedulingExceptionsDto = z.infer<typeof ListSchedulingExceptionsSchema>;
export type ResolveSchedulingExceptionsDto = z.infer<typeof ResolveSchedulingExceptionsSchema>;
export type DismissSchedulingExceptionsDto = z.infer<typeof DismissSchedulingExceptionsSchema>;
