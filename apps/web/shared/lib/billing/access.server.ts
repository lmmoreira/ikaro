import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import {
  CUSTOMER_FEATURE_KEYS,
  type BillingAccessResponse,
  type CustomerFeatureKey,
} from '@ikaro/types';
import { bffServerFetch } from '@/shared/lib/api/bff-server';
import { toTenantAccess, type TenantAccess } from './tenant-access';

// `ok: false` is "no usable answer": every caller reads it as fail-open (the dashboard renders as
// it did before billing), never as a lock or a suspension (UC-121 A2: the backend guard is the
// only enforcement point, so a failed read here must not take a tenant offline).
export type TenantAccessResult =
  { readonly ok: true; readonly access: TenantAccess } | { readonly ok: false };

const FAIL_OPEN: TenantAccessResult = { ok: false };

// The one `GET /billing/access` read every reader below shares. `null` is "no usable answer":
// a failed request, a non-2xx answer or an unparsable body. React's `cache` de-duplicates it inside
// one render, so a layout that asks for the operational flag and the features (or a page and its
// layout) make a single request and can never see two different answers.
async function fetchAccessBody(token: string): Promise<Partial<BillingAccessResponse> | null> {
  try {
    const res = await bffServerFetch(token, '/billing/access', { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as Partial<BillingAccessResponse> | null;
  } catch {
    return null;
  }
}

const readAccessBody = cache(fetchAccessBody);

async function readTenantAccess(token: string): Promise<TenantAccessResult> {
  const body = await readAccessBody(token);
  if (!body) return FAIL_OPEN;
  try {
    // A well-formed JSON body of the wrong shape (a number, `features: [null]`) makes the
    // conversion throw; that is still "no usable answer", never an error the layout surfaces.
    const access = toTenantAccess(body as BillingAccessResponse);
    return access ? { ok: true, access } : FAIL_OPEN;
  } catch {
    return FAIL_OPEN;
  }
}

// Server-side, uncached across requests (the backend port owns the 300 s / 10 s staleness bound).
// React's `cache` only de-duplicates inside one render, so a layout and its page that both ask
// share a single call.
export const fetchTenantAccess = cache(readTenantAccess);

// A customer's role-reduced answer carries `operational` and plain feature keys, not the
// `{ key, tier }` entries `toTenantAccess` reads, so that converter takes it as "no usable answer".
// The customer account needs the one boolean for its "Empresa inativa" surfaces (UC-121), hence its
// own reader. `null` is "no usable answer" and fails open: no badge, never a suspension inferred
// from a failed read.
async function readCustomerTenantOperational(token: string): Promise<boolean | null> {
  const body = await readAccessBody(token);
  return typeof body?.operational === 'boolean' ? body.operational : null;
}

export const fetchCustomerTenantOperational = cache(readCustomerTenantOperational);

// The customer-facing features the tenant holds, from the same one answer (no extra request, and
// `cache` shares it with the readers above). `null` is "no usable answer" and fails open: the
// account shows every surface, a failed read never hides one. A suspended tenant entitles nothing,
// so its list is empty without any feature being missing: while it is not operational the list
// says nothing about the plan, and `operational` alone decides what the customer sees (UC-121).
async function readCustomerFeatures(token: string): Promise<readonly CustomerFeatureKey[] | null> {
  const body = await readAccessBody(token);
  // The list says something about the plan only for an operational tenant (a suspended one entitles
  // nothing), and only when the answer says so explicitly: an absent or malformed `operational` is
  // no usable answer, never an empty plan.
  if (body?.operational !== true) return null;
  if (!Array.isArray(body.features)) return null;
  const held: readonly unknown[] = body.features;
  // Every entry must be a plain key (an unknown key is a feature a newer backend added and is
  // ignored); anything else, such as the staff `{ key, tier }` shape, is no usable answer. An empty
  // list from a malformed body would hide every tab instead of failing open.
  if (!held.every((entry) => typeof entry === 'string')) return null;
  return CUSTOMER_FEATURE_KEYS.filter((key) => held.includes(key));
}

export const fetchCustomerFeatures = cache(readCustomerFeatures);

// A page owned by a customer-facing feature: a tenant without it has no such page, so its customer
// goes back to Início. A failed access read redirects nowhere (fail open). Every customer page that
// belongs to a feature calls this first, with that feature.
export async function redirectCustomerWithoutFeature(
  token: string,
  tenantSlug: string,
  feature: CustomerFeatureKey,
): Promise<void> {
  const features = await fetchCustomerFeatures(token);
  if (features !== null && !features.includes(feature)) {
    redirect(`/${tenantSlug}/my-account`);
  }
}

// The customer pages owned by `BOOKING` (recurring reservations and availability alerts). Without
// the feature the customer goes to Início; a suspended tenant refuses their reads (UC-121), so the
// customer goes to the bookings list, which stays readable.
export async function redirectCustomerWhenBookingUnavailable(
  token: string,
  tenantSlug: string,
): Promise<void> {
  await redirectCustomerWithoutFeature(token, tenantSlug, 'BOOKING');
  if ((await fetchCustomerTenantOperational(token)) === false) {
    redirect(`/${tenantSlug}/my-account/bookings`);
  }
}
