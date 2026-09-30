import { z } from 'zod';
import {
  DismissSchedulingExceptionsBodySchema,
  ListSchedulingExceptionsQuerySchema,
  ResolveSchedulingExceptionsBodySchema,
} from '@ikaro/validation';

// Re-exported so the controller and its specs import from one place — the backend controller and
// this BFF take identical bodies (bad-smell-audit BFF-5), so the schemas live once in
// packages/validation/src/scheduling-exception.ts instead of hand-written copies per app.
export {
  DismissSchedulingExceptionsBodySchema,
  ListSchedulingExceptionsQuerySchema,
  ResolveSchedulingExceptionsBodySchema,
};

export type ListSchedulingExceptionsQuery = z.infer<typeof ListSchedulingExceptionsQuerySchema>;
export type ResolveSchedulingExceptionsBody = z.infer<typeof ResolveSchedulingExceptionsBodySchema>;
export type DismissSchedulingExceptionsBody = z.infer<typeof DismissSchedulingExceptionsBodySchema>;
