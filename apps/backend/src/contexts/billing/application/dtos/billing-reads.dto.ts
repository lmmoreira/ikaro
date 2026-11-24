import { z } from 'zod';

// `GET /billing/charges` (UC-117): Pattern A offset pagination, the same bounds as the operator
// list and the other Pattern A lists (docs/API_CONTRACTS.md): `limit` 1–100 (default 25), `offset` ≥ 0.
export const ListBillingChargesSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListBillingChargesDto = z.infer<typeof ListBillingChargesSchema>;
