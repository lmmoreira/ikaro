import type { APIResponse, Page } from '@playwright/test';
import type {
  CreateServiceRequest,
  StaffServiceResponse,
  UpdateServiceRequest,
} from '@ikaro/types';
import { BFF_URL } from '../auth/shared';

export interface CreatedServiceSetup {
  readonly serviceId: string;
  readonly name: string;
}

export function makeUniqueServiceName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

async function readServiceResponse(
  res: APIResponse,
  action: string,
): Promise<StaffServiceResponse> {
  if (!res.ok()) {
    throw new Error(`${action} failed: ${res.status()} ${await res.text()}`);
  }

  return (await res.json()) as StaffServiceResponse;
}

export async function createService(
  page: Page,
  body: CreateServiceRequest,
): Promise<StaffServiceResponse> {
  const res = await page.request.post(`${BFF_URL}/services`, { data: body });
  return readServiceResponse(res, 'create service');
}

export async function updateService(
  page: Page,
  serviceId: string,
  body: UpdateServiceRequest,
): Promise<StaffServiceResponse> {
  const res = await page.request.patch(`${BFF_URL}/services/${serviceId}`, { data: body });
  return readServiceResponse(res, 'update service');
}

export async function activateService(page: Page, serviceId: string): Promise<void> {
  const res = await page.request.patch(`${BFF_URL}/services/${serviceId}/activate`, {
    data: {},
  });
  if (!res.ok()) {
    throw new Error(`activate service failed: ${res.status()} ${await res.text()}`);
  }
}

export async function deactivateService(page: Page, serviceId: string): Promise<void> {
  const res = await page.request.delete(`${BFF_URL}/services/${serviceId}`);
  if (!res.ok() && res.status() !== 204) {
    throw new Error(`deactivate service failed: ${res.status()} ${await res.text()}`);
  }
}
