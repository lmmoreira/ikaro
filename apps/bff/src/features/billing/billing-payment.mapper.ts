import type { BillingPaymentLinkResponse, BillingPaymentReturnResponse } from '@ikaro/types';
import type { BackendBillingPaymentLink, BackendBillingPaymentReturn } from './billing.types';

// Paying a charge (M26-S15, UC-119): plain functions from the backend's two answers, parsed at the
// boundary, to the public response types. Kept beside `billing.mapper.ts` (a second mapper file, as
// `bookings-detail.mapper.ts` is beside `bookings.mapper.ts`) so neither passes the file-size cap.

/**
 * The payment link of one charge. Display strings are the web's: the answer is the status and the
 * provider's URL and expiry as the backend parsed them; a paid charge has neither.
 */
export function toBillingPaymentLinkResponse(
  backend: BackendBillingPaymentLink,
): BillingPaymentLinkResponse {
  if (backend.status === 'PAID') return { status: 'PAID', paymentUrl: null, expiresAt: null };
  return {
    status: backend.status,
    paymentUrl: backend.paymentUrl,
    expiresAt: backend.expiresAt,
  };
}

/** The state `payment-return` answers: the charge's status and the one "awaiting payment" signal. */
export function toBillingPaymentReturnResponse(
  backend: BackendBillingPaymentReturn,
): BillingPaymentReturnResponse {
  return {
    status: backend.status,
    paymentConfirmationPending: backend.paymentConfirmationPending,
  };
}
