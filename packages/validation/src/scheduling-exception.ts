import { z } from 'zod';
import { GenericErrorCode } from '@ikaro/types';

// M23-S08 (UC-077) — shared by the backend (scheduling-exception.controller.ts) and the BFF
// (scheduling-exceptions.schemas.ts): both take the identical request bodies with no per-app
// deviation, so they live here once.

export const FUTURE_COMMITMENT_EXCEPTION_STATUSES = ['OPEN', 'RESOLVED', 'DISMISSED'] as const;
export const FUTURE_COMMITMENT_RESOLUTION_TYPES = [
  'KEEP',
  'REASSIGN',
  'RESCHEDULE',
  'CANCEL',
] as const;

// Bulk actions take at most this many entries per request.
export const MAX_SCHEDULING_EXCEPTION_BATCH = 100;

export const ListSchedulingExceptionsQuerySchema = z.object({
  status: z.enum(FUTURE_COMMITMENT_EXCEPTION_STATUSES).optional(),
});

// An explicit resource, or AUTO: each booking gets the least-loaded free active resource of its type.
export const ReassignTargetSchema = z.union([
  z.strictObject({ resourceId: z.uuid() }),
  z.strictObject({ mode: z.literal('AUTO') }),
]);

const exceptionIdsField = () =>
  z
    .array(z.uuid())
    .min(1)
    .max(MAX_SCHEDULING_EXCEPTION_BATCH)
    .refine((ids) => new Set(ids).size === ids.length, {
      error: 'exceptionIds must not contain duplicates',
      params: { code: GenericErrorCode.VALUE_INVALID },
    });

const invalid = (path: string, error: string) => ({
  code: 'custom' as const,
  path: [path],
  message: error,
  params: { code: GenericErrorCode.VALUE_INVALID },
});

export const ResolveSchedulingExceptionsBodySchema = z
  .object({
    exceptionIds: exceptionIdsField(),
    resolutionType: z.enum(FUTURE_COMMITMENT_RESOLUTION_TYPES),
    reason: z.string().trim().min(1).max(500).optional(),
    target: ReassignTargetSchema.optional(),
    scheduledAt: z.iso.datetime().optional(),
  })
  .superRefine((body, ctx) => {
    const { resolutionType } = body;
    if (resolutionType === 'REASSIGN' && !body.target) {
      ctx.addIssue(invalid('target', 'target is required for REASSIGN'));
    }
    if (resolutionType !== 'REASSIGN' && body.target) {
      ctx.addIssue(invalid('target', 'target is only allowed for REASSIGN'));
    }
    if (resolutionType === 'RESCHEDULE' && !body.scheduledAt) {
      ctx.addIssue(invalid('scheduledAt', 'scheduledAt is required for RESCHEDULE'));
    }
    if (resolutionType !== 'RESCHEDULE' && body.scheduledAt) {
      ctx.addIssue(invalid('scheduledAt', 'scheduledAt is only allowed for RESCHEDULE'));
    }
    if (resolutionType === 'RESCHEDULE' && body.exceptionIds.length !== 1) {
      ctx.addIssue(invalid('exceptionIds', 'RESCHEDULE takes exactly one exception'));
    }
  });

export const DismissSchedulingExceptionsBodySchema = z.object({
  exceptionIds: exceptionIdsField(),
  reason: z.string().trim().min(1).max(500),
});
