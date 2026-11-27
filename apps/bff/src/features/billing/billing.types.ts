import type { z } from 'zod';
import type { BackendPublicPricesSchema } from './billing.public.schemas';
import type {
  BackendBillingChargesSchema,
  BackendBillingPaymentLinkSchema,
  BackendBillingPaymentReturnSchema,
  BackendBillingPlanPreviewSchema,
  BackendBillingPlanSchema,
  BackendBillingSummarySchema,
  BackendTenantAccessSchema,
} from './billing.schemas';

/** What the BFF keeps of the backend's access answer (never the reason or the internal markers). */
export type BackendTenantAccess = z.infer<typeof BackendTenantAccessSchema>;

/** The backend's billing summary after the boundary parse: only the declared fields remain. */
export type BackendBillingSummary = z.infer<typeof BackendBillingSummarySchema>;

/** The backend's charge history page after the boundary parse. */
export type BackendBillingCharges = z.infer<typeof BackendBillingChargesSchema>;

/** The backend's plan catalog after the boundary parse. */
export type BackendBillingPlan = z.infer<typeof BackendBillingPlanSchema>;

/** The backend's plan preview after the boundary parse. */
export type BackendBillingPlanPreview = z.infer<typeof BackendBillingPlanPreviewSchema>;

/** The backend's payment link after the boundary parse: the only place a provider URL survives. */
export type BackendBillingPaymentLink = z.infer<typeof BackendBillingPaymentLinkSchema>;

/** The backend's payment-return answer after the boundary parse. */
export type BackendBillingPaymentReturn = z.infer<typeof BackendBillingPaymentReturnSchema>;

/** The backend's public price list after the boundary parse (UC-128). */
export type BackendPublicPrices = z.infer<typeof BackendPublicPricesSchema>;
