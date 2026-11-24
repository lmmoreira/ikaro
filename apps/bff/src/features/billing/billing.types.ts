import type { z } from 'zod';
import type {
  BackendBillingChargesSchema,
  BackendBillingSummarySchema,
  BackendTenantAccessSchema,
  BillingChargesQuerySchema,
} from './billing.schemas';

/** What the BFF keeps of the backend's access answer (never the reason or the internal markers). */
export type BackendTenantAccess = z.infer<typeof BackendTenantAccessSchema>;

/** The backend's billing summary after the boundary parse: only the declared fields remain. */
export type BackendBillingSummary = z.infer<typeof BackendBillingSummarySchema>;

/** The backend's charge history page after the boundary parse. */
export type BackendBillingCharges = z.infer<typeof BackendBillingChargesSchema>;

export type BillingChargesQuery = z.infer<typeof BillingChargesQuerySchema>;
