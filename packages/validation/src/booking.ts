import { z } from 'zod';
import { TimeOfDayErrorCode } from '@ikaro/types';
import { isValidTimeOfDay } from './date';

// M21-S01 — shared by the backend (resource.dto.ts) and BFF (resource.schemas.ts) request
// schemas for the Resource Management endpoints; both need the identical shape with no per-app
// deviation, so this lives here directly rather than duplicated (mirrors HotsiteModuleSchema's
// own direct-reuse pattern in hotsite.ts, not buildUpdateTenantSettingsSchema's
// per-app-customization pattern in tenant-settings.ts).
const timeOfDayField = (): z.ZodString =>
  z.string().refine(isValidTimeOfDay, {
    error: 'must be HH:MM (00:00–23:59)',
    params: { code: TimeOfDayErrorCode.FORMAT_INVALID },
  });

export const DayHoursSchema = z
  .object({
    open: timeOfDayField(),
    close: timeOfDayField(),
  })
  .nullable();

export const WorkingHoursSchema = z.object({
  monday: DayHoursSchema,
  tuesday: DayHoursSchema,
  wednesday: DayHoursSchema,
  thursday: DayHoursSchema,
  friday: DayHoursSchema,
  saturday: DayHoursSchema,
  sunday: DayHoursSchema,
});

// Accepts all 4 domain ResourceType values, including 'LOCATION' — the "never manually
// created" rule (docs/14-API_CONTRACTS.md § Resource Management) is a domain-level 422
// (ResourceTypeNotCreatableError), not a transport-level 400. Rejecting 'LOCATION' here
// instead would surface a generic Zod 400 rather than the documented Problem Details 422
// (Codex round-4 finding, PR #457).
export const ResourceTypeSchema = z.enum(['LOCATION', 'STAFF', 'ROOM', 'EQUIPMENT']);

export const CreateResourceSchema = z
  .object({
    type: ResourceTypeSchema,
    refId: z.uuid().optional(),
    name: z.string().min(1),
    workingHours: WorkingHoursSchema.nullable().optional(),
    turnoverMinutes: z.number().int().min(0).optional(),
    maxCapacity: z.number().int().positive().nullable().optional(),
  })
  .strict();

export const UpdateResourceWorkingHoursSchema = z
  .object({
    workingHours: WorkingHoursSchema.nullable(),
  })
  .strict();
