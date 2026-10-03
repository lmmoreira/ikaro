import { z } from 'zod';
import {
  DurationMinutesQuerySchema,
  isResourceIdExclusiveOfSelections,
  RESOURCE_ID_EXCLUDES_SELECTIONS_MESSAGE,
  ResourceSelectionsQuerySchema,
} from '@ikaro/validation';

export const GetAvailabilitySchema = z
  .object({
    date: z.iso.date({ error: 'date must be a valid YYYY-MM-DD calendar date' }),
    serviceIds: z
      .string()
      .transform((s) => s.split(','))
      .pipe(z.array(z.uuid()).min(1, 'at least one serviceId is required')),
    // Optional — omit for tenant-wide availability (today's behavior, unchanged). When set, scopes
    // the calculation to that resource's own closures/openings/workingHours.
    resourceId: z.uuid().optional(),
    // Optional — the customer's picks for the queried services' CUSTOMER_CHOICE requirements.
    resourceSelections: ResourceSelectionsQuerySchema.optional(),
    // Optional — the chosen duration for the one CUSTOMER_SELECTED service in serviceIds.
    durationMinutes: DurationMinutesQuerySchema.optional(),
  })
  .refine(isResourceIdExclusiveOfSelections, {
    error: RESOURCE_ID_EXCLUDES_SELECTIONS_MESSAGE,
    path: ['resourceSelections'],
  });

export type GetAvailabilityDto = z.infer<typeof GetAvailabilitySchema>;
