import type { APIResponse, Page } from '@playwright/test';
import type {
  LeadFormConfigResponse,
  LeadFormQuestion,
  UpdateLeadFormConfigRequest,
} from '@ikaro/types';
import { BFF_URL, WEB_INTERNAL_KEY } from '../auth/shared';

async function readLeadFormConfigResponse(
  res: APIResponse,
  action: string,
): Promise<LeadFormConfigResponse> {
  if (!res.ok()) {
    throw new Error(`${action} failed: ${res.status()} ${await res.text()}`);
  }
  return (await res.json()) as LeadFormConfigResponse;
}

export async function getLeadFormConfig(page: Page): Promise<LeadFormConfigResponse> {
  const res = await page.request.get(`${BFF_URL}/tenants/lead-form/config`, {
    headers: { 'X-Web-Internal-Key': WEB_INTERNAL_KEY! },
  });
  return readLeadFormConfigResponse(res, 'get lead-form config');
}

export async function updateLeadFormConfig(
  page: Page,
  body: UpdateLeadFormConfigRequest,
): Promise<LeadFormConfigResponse> {
  const res = await page.request.patch(`${BFF_URL}/tenants/lead-form/config`, {
    data: body,
    headers: { 'X-Web-Internal-Key': WEB_INTERNAL_KEY! },
  });
  return readLeadFormConfigResponse(res, 'update lead-form config');
}

// audienceMode/questions -> PATCH body, used to restore a tenant's lead-form config to its
// pre-test state in afterEach — same rationale as helpers/hotsite/hotsite-api.ts's own
// toUpdateRequest. Only these two fields: teaser fields live on HotsiteConfig's own layout
// entry and are already restored by that helper's toUpdateRequest/updateHotsiteConfig pair, so
// restoring them again here would be redundant.
export function toUpdateRequest(
  config: LeadFormConfigResponse,
): Pick<UpdateLeadFormConfigRequest, 'audienceMode' | 'questions'> {
  return {
    audienceMode: config.audienceMode,
    questions: config.questions.map((question): LeadFormQuestion => {
      const next = { ...(question as LeadFormQuestion & { hasSubmissions?: boolean }) };
      delete next.hasSubmissions;
      return next;
    }),
  };
}
