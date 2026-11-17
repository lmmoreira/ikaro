import 'server-only';
import { cache } from 'react';
import type { BillingAccessResponse } from '@ikaro/types';
import { bffServerFetch } from '@/shared/lib/api/bff-server';
import { toTenantAccess, type TenantAccess } from './tenant-access';

// `ok: false` is "no usable answer": every caller reads it as fail-open (the dashboard renders as
// it did before billing), never as a lock or a suspension (UC-121 A2: the backend guard is the
// only enforcement point, so a failed read here must not take a tenant offline).
export type TenantAccessResult =
  { readonly ok: true; readonly access: TenantAccess } | { readonly ok: false };

const FAIL_OPEN: TenantAccessResult = { ok: false };

// The one `GET /billing/access` read both readers below share. `null` is "no usable answer":
// a failed request, a non-2xx answer or an unparsable body.
async function readAccessBody(token: string): Promise<Partial<BillingAccessResponse> | null> {
  try {
    const res = await bffServerFetch(token, '/billing/access', { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as Partial<BillingAccessResponse> | null;
  } catch {
    return null;
  }
}

async function readTenantAccess(token: string): Promise<TenantAccessResult> {
  const body = await readAccessBody(token);
  const access = body ? toTenantAccess(body as BillingAccessResponse) : null;
  return access ? { ok: true, access } : FAIL_OPEN;
}

// Server-side, uncached across requests (the backend port owns the 300 s / 10 s staleness bound).
// React's `cache` only de-duplicates inside one render, so a layout and its page that both ask
// share a single call.
export const fetchTenantAccess = cache(readTenantAccess);

// A customer's role-reduced answer carries `operational` and nothing else, so `toTenantAccess`
// (which needs `features`) reads it as "no usable answer". The customer account needs only that
// one boolean for its "Empresa inativa" surfaces (UC-121), hence its own reader. `null` is "no
// usable answer" and fails open: no badge, never a suspension inferred from a failed read.
async function readCustomerTenantOperational(token: string): Promise<boolean | null> {
  const body = await readAccessBody(token);
  return typeof body?.operational === 'boolean' ? body.operational : null;
}

export const fetchCustomerTenantOperational = cache(readCustomerTenantOperational);
