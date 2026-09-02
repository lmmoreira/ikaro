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
    // Matches booking.resources.name's VARCHAR(255) column (docs/13-DATABASE_SCHEMA.md) — without
    // this, oversized input reaches persistence and can surface as a raw DB error instead of a
    // clean validation response (Codex round-5 finding, PR #457).
    name: z.string().min(1).max(255),
    workingHours: WorkingHoursSchema.nullable().optional(),
    turnoverMinutes: z.number().int().min(0).optional(),
    maxCapacity: z.number().int().positive().nullable().optional(),
  })
  .strict();

// Every field independently optional (PATCH semantics) — a manager can correct any mistake
// made at creation (including type/refId) rather than deactivate+recreate. `type` accepts all
// 4 values for the same reason CreateResourceSchema does: rejecting/assigning LOCATION is a
// domain-level 409 (ResourceLocationTypeImmutableError), not a transport-level 400. `.default({})`
// lets an empty/omitted body through Zod (docs/CODE_STANDARDS.md's PATCH-all-optional-fields
// rule) — the use case then has nothing to change and returns the resource as-is (user decision,
// PR #457 round 9+, broadening this from workingHours-only).
export const UpdateResourceSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    type: ResourceTypeSchema.optional(),
    refId: z.uuid().nullable().optional(),
    workingHours: WorkingHoursSchema.nullable().optional(),
    turnoverMinutes: z.number().int().min(0).optional(),
    maxCapacity: z.number().int().positive().nullable().optional(),
  })
  .strict()
  .default({});
