import type { Page } from '@playwright/test';
import { buildTemplateManifest } from '@ikaro/hotsite-templates';
import type {
  GenerateHotsiteImageSignedUrlResponse,
  HotsiteAdminContentResponse,
} from '@ikaro/types';
import { BFF_URL, WEB_INTERNAL_KEY } from '../auth/shared';
import { publishHotsite, updateHotsiteConfig } from './hotsite-api';
import { makeSolidPng } from './test-png';

export const TEMPLATE_NAMES = [
  'beloauto',
  'casa47',
  'mimo-pet',
  'origem',
  'clinica-lume',
  'lume-studio',
] as const;

export type TemplateName = (typeof TEMPLATE_NAMES)[number];

type TemplateFixture = Pick<HotsiteAdminContentResponse, 'branding' | 'layout' | 'seo'>;

// The six catalogue templates (packages/hotsite-templates) are the source of truth for each
// composition; the spec applies them through the real PATCH so the public page is rendered from
// what a manager would really publish.
const IDENTITY = { brandName: 'Marca Exemplo', tagline: 'Slogan de exemplo' };

// Catalogue images are platform-owned objects uploaded by the deploy pipelines; this suite renders
// every composition against one image the tenant owns instead, so it does not depend on the
// catalogue upload having run (hotsite-templates-api.spec.ts covers the real catalogue paths).
const TEMPLATE_ASSET_PATH = /^shared\/hotsite-templates\//;

function substituteTemplateAssets<T>(value: T, replacement: string): T {
  if (typeof value === 'string') {
    return (TEMPLATE_ASSET_PATH.test(value) ? replacement : value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => substituteTemplateAssets(item, replacement)) as T;
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        substituteTemplateAssets(item, replacement),
      ]),
    ) as T;
  }
  return value;
}

export function loadTemplateFixture(name: TemplateName): TemplateFixture {
  return buildTemplateManifest(name, 'pt-BR', IDENTITY);
}

// Uploads one small image to the tenant's tmp staging area through the real signed-URL flow and
// returns its tmp path, which the next PATCH promotes to a permanent tenant-owned path.
async function uploadTenantImage(page: Page): Promise<string> {
  const headers = { 'X-Web-Internal-Key': WEB_INTERNAL_KEY! };
  const signed = await page.request.post(`${BFF_URL}/tenants/hotsite/images/signed-url`, {
    data: { fileName: 'template.png', contentType: 'image/png', purpose: 'hero' },
    headers,
  });
  if (!signed.ok()) throw new Error(`signed url failed: ${signed.status()} ${await signed.text()}`);
  const { signedUrl, filePath } = (await signed.json()) as GenerateHotsiteImageSignedUrlResponse;

  const upload = await page.request.put(signedUrl, {
    data: makeSolidPng(1604, 494),
    headers: { 'Content-Type': 'image/png' },
  });
  if (!upload.ok()) throw new Error(`image upload failed: ${upload.status()}`);
  return filePath;
}

// Applies a template to the signed-in manager's tenant and publishes it, exactly as the editor's
// Publish does: a real PATCH of the fixture's manifest, then the real publish. Returns the fixture
// so the caller can assert on what it declared.
export async function applyTemplateFixture(
  page: Page,
  name: TemplateName,
): Promise<TemplateFixture> {
  const imagePath = await uploadTenantImage(page);
  const fixture = substituteTemplateAssets(loadTemplateFixture(name), imagePath);
  await updateHotsiteConfig(page, fixture);
  await publishHotsite(page);
  return fixture;
}
