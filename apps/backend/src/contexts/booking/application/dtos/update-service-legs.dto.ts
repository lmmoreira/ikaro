import { z } from 'zod';
import { ServiceLegSchema } from './resource-requirement.dto';

// No .min(2) here on purpose — UC-052 A1's "fewer than 2 legs" rejection is a domain-level
// 422 (BookingServiceLegsTooFewError), not a generic Zod 400; a Zod-level minimum would make
// that error code unreachable.
export const UpdateServiceLegsSchema = z.object({
  legs: z.array(ServiceLegSchema),
});

export type UpdateServiceLegsDto = z.infer<typeof UpdateServiceLegsSchema>;
