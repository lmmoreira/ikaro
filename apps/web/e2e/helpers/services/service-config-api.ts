import type { APIResponse, Page } from '@playwright/test';
import type {
  PublishServiceIntakeSchemaRequest,
  ResourceRequirementRequestItem,
  ServiceLegRequestItem,
  UpdateServiceBookingPolicyRequest,
} from '@ikaro/types';
import { BFF_URL, WEB_INTERNAL_KEY } from '../auth/shared';

// BFF wrappers for the Serviços configuration tabs (M22-S04), used by specs that need a service
// with resource requirements, legs, a booking policy or an intake form without driving the UI.
// Each call needs an authenticated MANAGER session on page.request.

const headers = () => ({ 'X-Web-Internal-Key': WEB_INTERNAL_KEY! });

async function expectOk(res: APIResponse, action: string): Promise<void> {
  if (!res.ok()) {
    throw new Error(`${action} failed: ${res.status()} ${await res.text()}`);
  }
}

export async function setResourceRequirements(
  page: Page,
  serviceId: string,
  resourceRequirements: readonly ResourceRequirementRequestItem[],
): Promise<void> {
  const res = await page.request.patch(`${BFF_URL}/services/${serviceId}/resource-requirements`, {
    data: { resourceRequirements },
    headers: headers(),
  });
  await expectOk(res, 'set resource requirements');
}

export async function setServiceLegs(
  page: Page,
  serviceId: string,
  legs: readonly ServiceLegRequestItem[],
): Promise<void> {
  const res = await page.request.put(`${BFF_URL}/services/${serviceId}/legs`, {
    data: { legs },
    headers: headers(),
  });
  await expectOk(res, 'set service legs');
}

export async function setBookingPolicy(
  page: Page,
  serviceId: string,
  policy: UpdateServiceBookingPolicyRequest,
): Promise<void> {
  const res = await page.request.patch(`${BFF_URL}/services/${serviceId}/booking-policy`, {
    data: policy,
    headers: headers(),
  });
  await expectOk(res, 'set booking policy');
}

export async function publishIntakeSchema(
  page: Page,
  serviceId: string,
  schema: PublishServiceIntakeSchemaRequest,
): Promise<void> {
  const res = await page.request.post(`${BFF_URL}/services/${serviceId}/intake-schema`, {
    data: schema,
    headers: headers(),
  });
  await expectOk(res, 'publish intake schema');
}
