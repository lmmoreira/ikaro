import type { APIResponse, Page } from '@playwright/test';
import type {
  GenerateHotsiteImageSignedUrlResponse,
  PublishServiceIntakeSchemaRequest,
  ServicePublicProfileItem,
  ResourceRequirementRequestItem,
  ServiceLegRequestItem,
  UpdateServiceBookingPolicyRequest,
  UpdateServicePublicPageRequest,
} from '@ikaro/types';
import { BFF_URL, WEB_INTERNAL_KEY } from '../auth/shared';
import { makeSolidPng } from '../hotsite/test-png';

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

// TD56-S03 — publishes/unpublishes a service's public page and sets its content without driving
// the Página pública tab. Returns the generated slug (null while unpublished and never published).
export async function setServicePublicPage(
  page: Page,
  serviceId: string,
  body: UpdateServicePublicPageRequest,
): Promise<{
  publicPagePublished: boolean;
  publicSlug: string | null;
  publicProfile: ServicePublicProfileItem | null;
}> {
  const res = await page.request.patch(`${BFF_URL}/services/${serviceId}/public-page`, {
    data: body,
    headers: headers(),
  });
  await expectOk(res, 'set service public page');
  return (await res.json()) as {
    publicPagePublished: boolean;
    publicSlug: string | null;
    publicProfile: ServicePublicProfileItem | null;
  };
}

// Uploads one small image through the real signed-URL flow with the 'service-profile' purpose and
// returns its tmp path, which the next setServicePublicPage() promotes to a permanent object.
export async function uploadServiceProfileImage(page: Page, fileName: string): Promise<string> {
  const signed = await page.request.post(`${BFF_URL}/tenants/hotsite/images/signed-url`, {
    data: { fileName, contentType: 'image/png', purpose: 'service-profile' },
    headers: headers(),
  });
  await expectOk(signed, 'service-profile signed url');
  const { signedUrl, filePath } = (await signed.json()) as GenerateHotsiteImageSignedUrlResponse;

  const upload = await page.request.put(signedUrl, {
    data: makeSolidPng(640, 480),
    headers: { 'Content-Type': 'image/png' },
  });
  await expectOk(upload, 'service-profile image upload');
  return filePath;
}
