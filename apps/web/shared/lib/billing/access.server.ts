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

async function readTenantAccess(token: string): Promise<TenantAccessResult> {
  try {
    const res = await bffServerFetch(token, '/billing/access', { cache: 'no-store' });
    if (!res.ok) return FAIL_OPEN;
    const access = toTenantAccess((await res.json()) as BillingAccessResponse);
    return access ? { ok: true, access } : FAIL_OPEN;
  } catch {
    return FAIL_OPEN;
  }
}

// Server-side, uncached across requests (the backend port owns the 300 s / 10 s staleness bound).
// React's `cache` only de-duplicates inside one render, so a layout and its page that both ask
// share a single call.
export const fetchTenantAccess = cache(readTenantAccess);
