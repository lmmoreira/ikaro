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

// M22-S01 — shared by the backend (resource-requirement.dto.ts, create-service.dto.ts,
// update-service.dto.ts, update-service-resource-requirements.dto.ts,
// update-service-legs.dto.ts) and BFF (services.schemas.ts) request schemas for the
// Service resource-requirements/legs/booking-model endpoints; both need the identical
// shape with no per-app deviation (same direct-reuse pattern as CreateResourceSchema above).
export const BookingModelSchema = z.enum(['APPOINTMENT', 'SESSION']);

// Upper bounds are business-context maxima, not domain-tested limits — no AC specifies an exact
// number. They exist to cap the wholesale delete/reinsert write and the full-collection read
// every service load hydrates (typeorm-service.repository.ts), not to model a real product rule.
// A car wash/small-service-business bundle or leg count is realistically single-digit; 50/20
// leave generous headroom without allowing an unbounded payload to blow up either side.
// A duplicate ID inside one of these arrays would otherwise reach a composite-primary-key pool
// table (service_resource_requirement_pool / service_class_resource_pool) as an unhandled
// unique-constraint violation (500) instead of a clean 400 — reject it here instead.
function uniqueUuidArray(max: number) {
  return z
    .array(z.uuid())
    .max(max)
    .refine((ids) => new Set(ids).size === ids.length, { error: 'must not contain duplicate IDs' });
}

export const ResourceRequirementSchema = z.object({
  type: ResourceTypeSchema,
  selectionMode: z.enum(['NONE', 'CUSTOMER_CHOICE', 'AUTO_ANY', 'AUTO_FUNGIBLE_POOL']),
  resourcePoolIds: uniqueUuidArray(50).nullable().optional(),
  requiredQuantity: z.number().int().positive().optional(),
});

export const ServiceLegSchema = z.object({
  legIndex: z.number().int().min(0),
  name: z.string().min(1),
  durationMinutes: z.number().int().positive(),
  resourceRequirements: z.array(ResourceRequirementSchema).min(1).max(20),
  transitionGapAfterMinutes: z.number().int().min(0).optional(),
});

export const ClassResourceSlotSchema = z.object({
  type: ResourceTypeSchema,
  // .min(1) — unlike ResourceRequirement's nullable resourcePoolIds (null = unrestricted, a
  // meaningful state), eligibleResourceIds has no "unrestricted" fallback: a slot with zero
  // resources can't round-trip through persistence (service_class_resource_pool has one row per
  // (service, type, resourceId) — zero resources means zero rows, indistinguishable on reload
  // from no slot declared at all for that type).
  eligibleResourceIds: uniqueUuidArray(50).min(1),
});

// No .min(2) here on purpose — UC-052 A1's "fewer than 2 legs" rejection is a domain-level
// 422 (BookingServiceLegsTooFewError), not a generic Zod 400; a Zod-level minimum would make
// that error code unreachable.
export const UpdateServiceResourceRequirementsSchema = z.object({
  resourceRequirements: z.array(ResourceRequirementSchema).min(1).max(20),
});

export const UpdateServiceLegsSchema = z.object({
  legs: z.array(ServiceLegSchema).max(20),
});
