import { HttpException } from '@nestjs/common';
import type { ActorRole, BillingAccessResponse } from '@ikaro/types';
import { FEATURE_KEYS } from '@ikaro/validation';
import { ZodError } from 'zod';
import type { BackendTenantAccess } from './billing.types';

/** The one thing the recovery needs from a logger, so a spec can record messages without a mock. */
export interface AccessLookupLogger {
  error(message: string): void;
}

// What the BFF assumes when the backend lookup itself failed (UC-120 A2, fail open): an operational
// tenant with every sellable feature, chatbot at `BASIC`, exactly what a trial grants.
export function failOpenBackendAccess(): BackendTenantAccess {
  return {
    status: 'ACTIVE',
    operational: true,
    features: FEATURE_KEYS.map((key) => ({ key, tier: key === 'CHATBOT' ? 'BASIC' : 'STANDARD' })),
  };
}

// The `.catch(...)` of the access read (UC-120 A2): a 4xx is a real answer from the backend (an
// unknown tenant, a bad key) and is rethrown; anything else (an outage, a network error, a body
// that does not match the contract) fails open and is logged, so a paying tenant is never locked
// out by our own failure and the fallback is never silent.
export function recoverAccessLookup(
  err: unknown,
  tenantId: string,
  logger: AccessLookupLogger,
): BackendTenantAccess {
  if (err instanceof HttpException && err.getStatus() < 500) throw err;
  const cause =
    err instanceof ZodError
      ? 'invalid backend response'
      : err instanceof Error
        ? err.message
        : String(err);
  logger.error(`Billing access lookup failed for tenant '${tenantId}', failing open: ${cause}`);
  return failOpenBackendAccess();
}

// The role reduction (M25-S13, docs/API_CONTRACTS.md § Billing — Access Resolution): a manager runs
// the account and sees the status; staff see what is locked but never the payment state; a customer
// only learns whether the tenant is operational. Built field by field, never by spreading the
// backend answer, so nothing else can leak through.
export function toBillingAccessResponse(
  role: ActorRole,
  access: BackendTenantAccess,
): BillingAccessResponse {
  switch (role) {
    case 'MANAGER':
      return { status: access.status, operational: access.operational, features: access.features };
    case 'STAFF':
      return { operational: access.operational, features: access.features };
    case 'CUSTOMER':
      return { operational: access.operational };
  }
}
