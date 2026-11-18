import type { FeatureKey } from '@ikaro/types';
import { withClient } from '../db/e2e-db';
import { backendCall } from './backend';

// A tenant a spec owns. The seeded tenants are shared by dozens of specs (run in parallel locally),
// and suspension, the access cache and the feature rows are all keyed by tenant, so a scenario
// that suspends a tenant or removes a feature provisions its own and touches nothing else.
// Nothing deletes a tenant (there is no route), so the rows stay in the compose database under a
// unique slug; a spec restores or removes only what it changed.
export interface ProvisionedTenant {
  readonly tenantId: string;
  readonly slug: string;
  readonly name: string;
  readonly adminEmail: string;
}

export interface ProvisionOptions {
  // Free access, never charged. A TRIALING tenant is entitled to every sellable feature whatever
  // its items say, so a plan profile (a tenant without a feature) must be exempt; the operator
  // refuses to suspend an exempt tenant, so the suspended scenario must not be.
  readonly exempt: boolean;
  readonly prefix: string;
}

const PROVISION_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 250;

// Lowercase letters, digits and hyphens only (the slug rule); short enough for any slug limit.
function uniqueSlug(prefix: string): string {
  const stamp = `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  return `${prefix}-${stamp}`.slice(0, 40);
}

async function waitFor<T>(
  describe: string,
  read: () => Promise<T | null>,
  timeoutMs = PROVISION_TIMEOUT_MS,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (value !== null) return value;
    if (Date.now() > deadline) throw new Error(`timed out after ${timeoutMs} ms: ${describe}`);
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

// The same two calls `scripts/provision-tenant.sh` makes: reserve the Billing registration, then
// create the tenant with its id. Provisioning is event-driven: the manager (Staff), the location
// resource (Booking) and the subscription with its items (Billing) are each created by a
// `TenantProvisioned` handler, so the function returns only once the subscription exists, and the
// manager's first login is the caller's (it retries until the manager exists).
export async function provisionTenant(options: ProvisionOptions): Promise<ProvisionedTenant> {
  const slug = uniqueSlug(options.prefix);
  const adminEmail = `admin-${slug}@e2e.example.com`;
  const name = `E2E ${slug}`;

  const registration = await backendCall<{ registrationId: string }>(
    'POST',
    '/internal/billing/registrations',
    'internal',
    { source: 'OPERATOR', ...(options.exempt ? { exempt: true } : {}) },
  );
  const tenant = await backendCall<{ tenantId: string }>('POST', '/internal/tenants', 'operator', {
    name,
    slug,
    adminEmail,
    country_code: 'BR',
    timezone: 'America/Sao_Paulo',
    registrationId: registration.registrationId,
  });

  await waitForSubscription(tenant.tenantId, options.exempt);
  return { tenantId: tenant.tenantId, slug, name, adminEmail };
}

async function waitForSubscription(tenantId: string, exempt: boolean): Promise<void> {
  await waitFor(`the subscription of tenant ${tenantId}`, () =>
    withClient(async (client) => {
      const result = await client.query(
        `SELECT s.id, (SELECT count(*) FROM billing.subscription_items i
                        WHERE i.tenant_id = s.tenant_id AND i.subscription_id = s.id) AS items
           FROM billing.subscriptions s
          WHERE s.tenant_id = $1`,
        [tenantId],
      );
      if (result.rowCount !== 1) return null;
      // A trial tenant has no items (its entitlement is every sellable feature); an exempt one
      // starts with an open-ended item per feature, which is its plan.
      return exempt && Number(result.rows[0].items) === 0 ? null : true;
    }),
  );
}

// Removes features from an exempt tenant's plan. Nothing in M25 removes a feature, so this is a
// DELETE of the feature's rows (the table's GIST exclusion constraint and its starts/ends check
// make closing a row with a past `ends_at` unsafe). It must run BEFORE the tenant's first access
// read: the backend caches an operational answer for up to 300 s and a SQL write does not evict
// it. A missing subscription is never cached, and `provisionTenant` returns the moment the rows
// exist, so the caller removes features straight away and the first read sees the final plan.
export async function removeFeatures(
  tenantId: string,
  features: readonly FeatureKey[],
): Promise<void> {
  if (features.includes('HOTSITE')) {
    throw new Error('HOTSITE is the root of every plan and is never removable');
  }
  await withClient(async (client) => {
    await client.query(
      `DELETE FROM billing.subscription_items
        WHERE tenant_id = $1 AND feature_key = ANY($2::text[])`,
      [tenantId, features],
    );
  });
}
