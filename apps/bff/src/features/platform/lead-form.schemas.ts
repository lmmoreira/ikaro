import { z } from 'zod';

// Question-level bounds (≤20 entries, 2-10 options, non-empty label) are validated by the
// backend's LeadFormConfig.updateQuestions() alone (docs/ENGINEERING_RULES.md § Single source
// of truth for a validation rule's code) — not re-checked here.
const LeadFormQuestionSchema = z.object({
  id: z.uuid(),
  label: z.string(),
  type: z.enum(['TEXT', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE']),
  required: z.boolean(),
  options: z.array(z.string()).optional(),
  order: z.number().int(),
});

export const UpdateLeadFormConfigBodySchema = z
  .object({
    title: z.string(),
    subtitle: z.string(),
    eyebrow: z.string(),
    ctaLabel: z.string(),
    variant: z.enum(['centered', 'left-aligned']),
    backgroundImageUrl: z.string().nullable(),
    backgroundImagePosition: z.enum(['left', 'center', 'right']),
    bgStyle: z.enum(['primary', 'background']),
    audienceMode: z.enum(['GUEST_AND_CUSTOMER', 'CUSTOMER_ONLY']),
    questions: z.array(LeadFormQuestionSchema),
  })
  .partial();

export type UpdateLeadFormConfigBody = z.infer<typeof UpdateLeadFormConfigBodySchema>;
