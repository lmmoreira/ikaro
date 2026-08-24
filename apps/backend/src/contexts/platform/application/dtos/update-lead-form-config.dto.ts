import { z } from 'zod';

// Question-level bounds (≤20 entries, 2-10 options for choice types, non-empty label) are
// deliberately NOT re-validated here — LeadFormConfig.updateQuestions() is this rule's sole
// owner (docs/ENGINEERING_RULES.md § Single source of truth for a validation rule's code). A
// second Zod-side check here risks emitting a different code for the identical violation
// depending on which layer catches it first.
const LeadFormQuestionSchema = z.object({
  id: z.uuid(),
  label: z.string(),
  type: z.enum(['TEXT', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE']),
  required: z.boolean(),
  options: z.array(z.string()).optional(),
  order: z.number().int(),
});

// Teaser fields mirror BookingCtaModuleData's own shape family (docs/15-HOTSITE_DYNAMIC_
// ARCHITECTURE.md § LEAD_FORM) — standard hotsite-layout enum validation for variant/bgStyle/
// backgroundImagePosition, same as every other module's teaser data.
export const UpdateLeadFormConfigSchema = z
  .object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    eyebrow: z.string().optional(),
    ctaLabel: z.string().optional(),
    variant: z.enum(['centered', 'left-aligned']).optional(),
    backgroundImageUrl: z.string().nullable().optional(),
    backgroundImagePosition: z.enum(['left', 'center', 'right']).optional(),
    bgStyle: z.enum(['primary', 'background']).optional(),
    audienceMode: z.enum(['GUEST_AND_CUSTOMER', 'CUSTOMER_ONLY']).optional(),
    questions: z.array(LeadFormQuestionSchema).optional(),
  })
  .default({});

export type UpdateLeadFormConfigDto = z.infer<typeof UpdateLeadFormConfigSchema>;
