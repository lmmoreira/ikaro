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

export type UpdateLeadFormConfigBody = z.infer<typeof UpdateLeadFormConfigBodySchema>;
