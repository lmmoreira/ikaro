import { expect, test } from '@playwright/test';
import type { HotsiteAdminContentResponse } from '@ikaro/types';
import { HOTSITE_TEMPLATE_IDS } from '@ikaro/types';
import { loginAsStaff } from './helpers/auth';
import {
  applyHotsiteTemplate,
  applyHotsiteTemplateRequest,
  getHotsiteConfig,
  listHotsiteTemplates,
  publishHotsite,
  toUpdateRequest,
  unpublishHotsite,
  updateHotsiteConfig,
} from './helpers/hotsite';

// The template catalogue through the real BFF and backend (TD56-S04): list, apply, and the save
// round trip. There is no UI here — the picker is TD56-S05 — so this is an API-level spec, and it
// is also the only place the deploy-time image upload (the emulator seed) is proved to make every
// catalogue path resolvable.
//
// autospa-premium is the MANAGER tenant hotsite-editor.spec.ts and hotsite-templates.spec.ts use
// for the same reason: no booking/schedule/service spec touches its hotsite row. One tenant,
// strictly serial, restored afterwards.
const MANAGER_EMAIL = 'admin@autospa.com.br';
const SLUG = 'autospa-premium';
const BRAND_NAME = 'Marca E2E';

const catalogueImage = (id: string, file: string): RegExp =>
  new RegExp(`/shared/hotsite-templates/${id}/v1/${file}\\.webp$`);

test.describe.serial('hotsite template catalogue API (MANAGER)', () => {
  // Cleared before every test and set only once this test has captured the tenant's hotsite, so a
  // failed login or read can never write a previous test's snapshot back over the shared tenant.
  let original: HotsiteAdminContentResponse | undefined;

  test.beforeEach(async ({ page }) => {
    original = undefined;
    await loginAsStaff(page, MANAGER_EMAIL, SLUG);
    original = await getHotsiteConfig(page);
  });

  test.afterEach(async ({ page }) => {
    if (!original) return;
    await updateHotsiteConfig(page, toUpdateRequest(original));
    if (original.isPublished) {
      await publishHotsite(page);
    } else {
      await unpublishHotsite(page);
    }
  });

  test('lists the six templates, each with a thumbnail that resolves', async ({ page }) => {
    const templates = await listHotsiteTemplates(page);

    expect(templates.map((template) => template.id)).toEqual([...HOTSITE_TEMPLATE_IDS]);
    for (const template of templates) {
      expect(template.capabilities.length).toBeGreaterThan(0);
      expect(template.thumbnailUrl).toMatch(catalogueImage(template.id, 'thumbnail'));
      const image = await page.request.get(template.thumbnailUrl);
      expect(image.ok(), `${template.id} thumbnail`).toBe(true);
    }
  });

  test('applies Casa47 and then Lume Studio to a draft without saving or publishing anything', async ({
    page,
  }) => {
    const draft = toUpdateRequest(original!);
    draft.branding = { ...draft.branding, brandName: BRAND_NAME };

    const casa47 = await applyHotsiteTemplate(page, 'casa47', draft);

    expect(casa47.appliedTemplate).toEqual({ id: 'casa47', version: 1 });
    const hero = casa47.content.layout.find((module) => module.type === 'HERO');
    const heroImage = hero?.data.backgroundImageUrl as string;
    expect(heroImage).toMatch(catalogueImage('casa47', 'hero'));
    expect((await page.request.get(heroImage)).ok()).toBe(true);
    const chatbot = casa47.content.layout.find((module) => module.type === 'CHATBOT');
    expect(chatbot?.data.botName).toBe(BRAND_NAME);
    expect(JSON.stringify(casa47)).not.toMatch(/casa 47/i);

    // Applying a second template over the first draft: the draft goes back as paths, as a save would.
    const lumeStudio = await applyHotsiteTemplate(
      page,
      'lume-studio',
      toUpdateRequest({ ...original!, ...casa47.content }),
    );
    expect(lumeStudio.appliedTemplate.id).toBe('lume-studio');
    expect(lumeStudio.content.branding.brandName).toBe(BRAND_NAME);
    const lumeHero = lumeStudio.content.layout.find((module) => module.type === 'HERO');
    expect(lumeHero?.data.backgroundImageUrl as string).toMatch(
      catalogueImage('lume-studio', 'hero'),
    );

    // Nothing was written: the saved config and its publish state are exactly as found.
    const after = await getHotsiteConfig(page);
    expect(after.layout).toEqual(original!.layout);
    expect(after.branding).toEqual(original!.branding);
    expect(after.isPublished).toBe(original!.isPublished);
    expect(after.updatedAt).toBe(original!.updatedAt);
  });

  test('saves an applied draft and saves it again after reading it back (the round trip)', async ({
    page,
  }) => {
    const applied = await applyHotsiteTemplate(page, 'origem', toUpdateRequest(original!));

    // First save: the draft the editor holds, stripped back to paths.
    await updateHotsiteConfig(page, toUpdateRequest({ ...original!, ...applied.content }));
    const saved = await getHotsiteConfig(page);
    expect(saved.branding.primaryColor).toBe(applied.content.branding.primaryColor);
    // Origem's hero is typography-only, so its About section carries the first catalogue image.
    const savedAbout = saved.layout.find((module) => module.type === 'ABOUT');
    expect(savedAbout?.data.imageUrl as string).toMatch(catalogueImage('origem', 'about'));

    // Second save: read back from GET (resolved URLs) and stripped again. This is the step that
    // fails if a catalogue URL is not turned back into its registered path before saving.
    await updateHotsiteConfig(page, toUpdateRequest(saved));
    const resaved = await getHotsiteConfig(page);
    expect(resaved.layout.map((module) => module.type)).toEqual(
      applied.content.layout.map((module) => module.type),
    );
    expect(resaved.branding.primaryColor).toBe(applied.content.branding.primaryColor);
  });

  test('rejects an unregistered shared/ path on save', async ({ page }) => {
    const draft = toUpdateRequest(original!);
    const tampered = {
      ...draft,
      layout: [
        {
          type: 'ABOUT' as const,
          enabled: true,
          data: {
            title: 'x',
            body: 'y',
            imagePosition: 'left',
            imageUrl: 'shared/hotsite-templates/casa47/v1/not-released.webp',
          },
        },
      ],
    };

    await expect(updateHotsiteConfig(page, tampered)).rejects.toThrow(
      'PLATFORM_HOTSITE_IMAGE_NOT_UPLOADED',
    );
  });

  test('answers 404 for a template that is not in the catalogue', async ({ page }) => {
    const res = await applyHotsiteTemplateRequest(page, 'unknown', toUpdateRequest(original!));

    expect(res.status()).toBe(404);
    expect(await res.text()).toContain('PLATFORM_HOTSITE_TEMPLATE_NOT_FOUND');
  });
});
