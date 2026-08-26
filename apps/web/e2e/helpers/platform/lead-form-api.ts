import type { APIResponse, Page } from '@playwright/test';
import type { LeadFormConfigResponse, UpdateLeadFormConfigRequest } from '@ikaro/types';
import { BFF_URL, WEB_INTERNAL_KEY } from '../auth/shared';

async function readLeadFormConfig(
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
  return readLeadFormConfig(res, 'get lead-form config');
}

// audienceMode/questions live in LeadFormConfig (docs/02-DOMAIN_MODEL.md § LeadFormConfig
// "Cross-aggregate save"), saved atomically with the teaser fields through this one consolidated
// endpoint — the module's own enabled toggle stays out of scope here (see helpers/hotsite's
// updateHotsiteConfig for that, mirroring chatbot-widget.spec.ts's identical split).
export async function updateLeadFormConfig(
  page: Page,
  body: UpdateLeadFormConfigRequest,
): Promise<LeadFormConfigResponse> {
  const res = await page.request.patch(`${BFF_URL}/tenants/lead-form/config`, {
    data: body,
    headers: { 'X-Web-Internal-Key': WEB_INTERNAL_KEY! },
  });
  return readLeadFormConfig(res, 'update lead-form config');
}
