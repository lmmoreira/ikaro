import { z } from 'zod';

// Shape only (UC-128): the query parameter is present and a string. Every verdict (`available`,
// `taken`, `reserved`, `invalid` and its reason) is the backend's SlugPolicy; the BFF never checks
// length, characters or reserved words, so one layer reports each condition
// (docs/ENGINEERING_RULES_SHARED.md § Schema-level enforcement).
export const SlugAvailabilityQuerySchema = z.object({
  slug: z.string(),
});

export type SlugAvailabilityQuery = z.infer<typeof SlugAvailabilityQuerySchema>;
