import { HttpException, HttpStatus } from '@nestjs/common';
import { BillingErrorCode } from '@ikaro/types';

// The backend's typed refusal of a route whose feature the tenant does not hold. Callers that treat
// a missing feature as "nothing to show" (an empty list, no points) match exactly this one denial
// and let every other failure surface.
export function isFeatureNotEntitled(err: unknown): boolean {
  if (!(err instanceof HttpException) || err.getStatus() !== HttpStatus.FORBIDDEN) return false;
  const body = err.getResponse();
  return (
    typeof body === 'object' &&
    (body as { code?: unknown }).code === BillingErrorCode.FEATURE_NOT_ENTITLED
  );
}
