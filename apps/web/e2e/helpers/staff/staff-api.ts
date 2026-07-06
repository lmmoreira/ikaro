import type { APIResponse, Page } from '@playwright/test';
import type {
  InviteStaffRequest,
  InviteStaffResponse,
  StaffResponse,
  UpdateStaffRequest,
  UpdateStaffResponse,
} from '@ikaro/types';
import { BFF_URL } from '../auth/shared';

async function readJson<T>(res: APIResponse, action: string): Promise<T> {
  if (!res.ok()) {
    throw new Error(`${action} failed: ${res.status()} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export async function inviteStaff(
  page: Page,
  body: InviteStaffRequest,
): Promise<InviteStaffResponse> {
  const res = await page.request.post(`${BFF_URL}/staff/invite`, { data: body });
  return readJson(res, 'invite staff');
}

export async function updateStaff(
  page: Page,
  staffId: string,
  body: UpdateStaffRequest,
): Promise<UpdateStaffResponse> {
  const res = await page.request.patch(`${BFF_URL}/staff/${staffId}`, { data: body });
  return readJson(res, 'update staff');
}

export async function getStaffMember(page: Page, staffId: string): Promise<StaffResponse> {
  const res = await page.request.get(`${BFF_URL}/staff/${staffId}`);
  return readJson(res, 'get staff member');
}
