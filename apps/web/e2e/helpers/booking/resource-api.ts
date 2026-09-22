import type { APIResponse, Page } from '@playwright/test';
import type { CreateResourceRequest, ResourceResponse } from '@ikaro/types';
import { BFF_URL, WEB_INTERNAL_KEY } from '../auth/shared';

async function readJson<T>(res: APIResponse, action: string): Promise<T> {
  if (!res.ok()) {
    throw new Error(`${action} failed: ${res.status()} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export async function createResource(
  page: Page,
  body: CreateResourceRequest,
): Promise<ResourceResponse> {
  const res = await page.request.post(`${BFF_URL}/resources`, {
    data: body,
    headers: { 'X-Web-Internal-Key': WEB_INTERNAL_KEY! },
  });
  return readJson(res, 'create resource');
}

export async function deactivateResource(page: Page, resourceId: string): Promise<void> {
  const res = await page.request.delete(`${BFF_URL}/resources/${resourceId}`, {
    headers: { 'X-Web-Internal-Key': WEB_INTERNAL_KEY! },
  });
  if (res.status() === 404) return;
  if (!res.ok()) {
    throw new Error(`deactivate resource failed: ${res.status()} ${await res.text()}`);
  }
}
