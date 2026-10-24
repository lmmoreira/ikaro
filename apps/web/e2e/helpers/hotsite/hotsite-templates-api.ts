import type { APIResponse, Page } from '@playwright/test';
import type {
  ApplyHotsiteTemplateResponse,
  HotsiteAdminContentResponse,
  HotsiteTemplateSummaryResponse,
} from '@ikaro/types';
import { BFF_URL, WEB_INTERNAL_KEY } from '../auth/shared';

async function readJson<T>(res: APIResponse, action: string): Promise<T> {
  if (!res.ok()) {
    throw new Error(`${action} failed: ${res.status()} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export async function listHotsiteTemplates(page: Page): Promise<HotsiteTemplateSummaryResponse[]> {
  const res = await page.request.get(`${BFF_URL}/tenants/hotsite/templates`, {
    headers: { 'X-Web-Internal-Key': WEB_INTERNAL_KEY! },
  });
  return readJson(res, 'list hotsite templates');
}

// The draft goes in exactly as the editor sends it: image fields as storage paths (use
// toUpdateRequest first), and comes back with image fields resolved to public URLs.
export async function applyHotsiteTemplateRequest(
  page: Page,
  templateId: string,
  content: Pick<HotsiteAdminContentResponse, 'branding' | 'layout' | 'seo'>,
): Promise<APIResponse> {
  return page.request.post(`${BFF_URL}/tenants/hotsite/templates/${templateId}/apply`, {
    data: { content },
    headers: { 'X-Web-Internal-Key': WEB_INTERNAL_KEY! },
  });
}

export async function applyHotsiteTemplate(
  page: Page,
  templateId: string,
  content: Pick<HotsiteAdminContentResponse, 'branding' | 'layout' | 'seo'>,
): Promise<ApplyHotsiteTemplateResponse> {
  return readJson(
    await applyHotsiteTemplateRequest(page, templateId, content),
    `apply template ${templateId}`,
  );
}
