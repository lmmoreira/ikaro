import type { APIResponse, Page } from '@playwright/test';
import type { LeadFormAudienceMode, LeadFormConfigResponse, LeadFormQuestion } from '@ikaro/types';
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

export interface UpdateLeadFormConfigBody {
  readonly audienceMode: LeadFormAudienceMode;
  readonly questions: readonly LeadFormQuestion[];
}

// Writes go through PATCH /v1/tenants/hotsite as of M20-S08 — audienceMode/questions are
// optional fields on that consolidated endpoint (see UpdateHotsiteContentUseCase's own header
// comment on the backend), not a separate PATCH /tenants/lead-form/config anymore. Named for
// what it does (restore lead-form config), not the literal route, to keep the test file's own
// call sites unchanged.
export async function updateLeadFormConfig(
  page: Page,
  body: UpdateLeadFormConfigBody,
): Promise<void> {
  const res = await page.request.patch(`${BFF_URL}/tenants/hotsite`, {
    data: body,
    headers: { 'X-Web-Internal-Key': WEB_INTERNAL_KEY! },
  });
  if (!res.ok()) {
    throw new Error(`update lead-form config failed: ${res.status()} ${await res.text()}`);
  }
}

// audienceMode/questions -> PATCH body, used to restore a tenant's lead-form config to its
// pre-test state in afterEach — same rationale as helpers/hotsite/hotsite-api.ts's own
// toUpdateRequest. Only these two fields: teaser fields live on HotsiteConfig's own layout
// entry and are already restored by that helper's toUpdateRequest/updateHotsiteConfig pair, so
// restoring them again here would be redundant.
export function toUpdateRequest(config: LeadFormConfigResponse): UpdateLeadFormConfigBody {
  return {
    audienceMode: config.audienceMode,
    questions: config.questions.map((question): LeadFormQuestion => {
      const next = { ...(question as LeadFormQuestion & { hasSubmissions?: boolean }) };
      delete next.hasSubmissions;
      return next;
    }),
  };
}
