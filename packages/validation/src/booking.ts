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

// M22-S02 — shared by the backend (update-service-booking-policy.dto.ts,
// publish-service-intake-schema.dto.ts) and BFF (services.schemas.ts) request schemas for the
// Service booking-policy/intake-schema endpoints (same direct-reuse pattern as
// UpdateServiceResourceRequirementsSchema above).
export const ServiceApprovalModeSchema = z.enum(['AUTO_CONFIRM', 'MANUAL_APPROVAL']);
export const ServiceDurationPolicySchema = z.enum(['FIXED', 'CUSTOMER_SELECTED']);
export const ServicePricingPolicySchema = z.enum(['FIXED', 'PER_TIME_INCREMENT']);

// Every override field is independently nullable+optional: omitted = leave unchanged, null =
// explicitly clear back to the inherited tenant/platform default (mirrors UpdateResourceSchema's
// refId precedent above). Bounds mirror each field's tenant-setting counterpart
// (docs/21-TENANTS_SETTINGS_SCHEMA.md) where one exists.
// durationMaxMinutes >= durationMinMinutes is checked here (a format/relational sanity check,
// same class as uniqueUuidArray's refine above) — the durationPolicy/pricingPolicy pairing
// invariant (UC-055 A2) is deliberately NOT checked here: it's a domain-level 422
// (ServiceDurationPolicyRequiresPricingError), same reasoning as UpdateServiceLegsSchema's
// missing .min(2) above.
export const UpdateServiceBookingPolicySchema = z
  .object({
    defaultApprovalMode: ServiceApprovalModeSchema.nullable().optional(),
    manualHoldMinutes: z.number().int().positive().nullable().optional(),
    cancellationWindowHoursOverride: z.number().int().min(0).max(720).nullable().optional(),
    rescheduleWindowHoursOverride: z.number().int().min(0).max(720).nullable().optional(),
    minBookingAdvanceHoursOverride: z.number().int().min(0).max(8760).nullable().optional(),
    maxBookingAdvanceDaysOverride: z.number().int().min(1).max(365).nullable().optional(),
    recurrenceEligible: z.boolean().optional(),
    availabilityAlertEligible: z.boolean().optional(),
    durationPolicy: ServiceDurationPolicySchema.optional(),
    durationMinMinutes: z.number().int().positive().nullable().optional(),
    durationMaxMinutes: z.number().int().positive().nullable().optional(),
    durationIncrementMinutes: z.number().int().positive().nullable().optional(),
    pricingPolicy: ServicePricingPolicySchema.optional(),
    pricingIncrementMinutes: z.number().int().positive().nullable().optional(),
    pricePerIncrementAmount: z.number().positive().nullable().optional(),
    minimumChargeAmount: z.number().positive().nullable().optional(),
  })
  .refine(
    (data) =>
      data.durationMinMinutes == null ||
      data.durationMaxMinutes == null ||
      data.durationMaxMinutes >= data.durationMinMinutes,
    { error: 'durationMaxMinutes must be >= durationMinMinutes', path: ['durationMaxMinutes'] },
  )
  .default({});

// UC-054's typed markers — 'PICKUP_ADDRESS' is the only one defined so far (projects into the
// pre-existing services.requires_pickup_address / bookings.pickup_address columns); the generic
// shapes cover everything else a booking-intake question needs today.
export const ServiceIntakeQuestionTypeSchema = z.enum([
  'FREE_TEXT',
  'NAMED_ATTENDEES',
  'PICKUP_ADDRESS',
]);

export const ServiceIntakeQuestionSchema = z.object({
  fieldKey: z.string().min(1).max(100),
  label: z.string().min(1).max(500),
  type: ServiceIntakeQuestionTypeSchema,
  required: z.boolean(),
});

// No upper bound precedent exists for this shape (JSONB, not a normalized child table like
// resourceRequirements/legs) — 50 is a generous business-context ceiling, same rationale as
// uniqueUuidArray's own bound above.
export const PublishServiceIntakeSchemaSchema = z.object({
  questions: z
    .array(ServiceIntakeQuestionSchema)
    .min(1)
    .max(50)
    .refine((questions) => new Set(questions.map((q) => q.fieldKey)).size === questions.length, {
      error: 'fieldKey must be unique across questions',
    }),
  consentText: z.string().min(1).max(5000),
  requiresNamedAttendees: z.boolean().optional(),
  participantCountRequired: z.boolean().optional(),
});
