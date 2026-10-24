import { expect, test, type Page } from '@playwright/test';
import type { HotsiteAdminContentResponse } from '@ikaro/types';
import { loginAsStaff } from './helpers/auth';
import {
  enterDetailedEditor,
  getHotsiteConfig,
  getPublicManifest,
  makeSolidPng,
  openVisualEditor,
  publishHotsite,
  toUpdateRequest,
  unpublishHotsite,
  updateHotsiteConfig,
} from './helpers/hotsite';

// The template picker in the visual and the detailed editor (TD56-S05). Applying is pure on the
// server and only changes the in-memory draft, so most of what is asserted here is the draft and
// the editor's reaction; the public page is checked only after a real publish.
//
// Same MANAGER tenant and same discipline as hotsite-editor.spec.ts: one shared hotsite row, strictly
// serial, restored in afterEach. (A STAFF user having no access to the editor is covered there.)
const MANAGER_EMAIL = 'admin@autospa.com.br';
const SLUG = 'autospa-premium';

const HERO_PNG_BUFFER = makeSolidPng(1604, 494);

const COMMAND = (name: string): string => `[data-testid="visual-command"][data-command="${name}"]`;
const card = (page: Page, id: string) =>
  page.locator(`[data-testid="template-card"][data-template-id="${id}"]`);
const applyButton = (page: Page, id: string) => card(page, id).getByTestId('template-apply');
const selectedCards = (page: Page) =>
  page.locator('[data-testid="template-card"][data-selected="true"]');

// A reload lands back in the visual editor; wait for it to hydrate before the next click.
async function reloadEditor(page: Page): Promise<void> {
  await page.reload();
  await expect(page.getByTestId('hotsite-preview-content')).toBeVisible();
}

async function openTemplates(page: Page): Promise<void> {
  await page.locator(COMMAND('templates')).click();
  await expect(page.getByTestId('template-card')).toHaveCount(6);
}

async function applyTemplate(page: Page, id: string): Promise<void> {
  await applyButton(page, id).click();
  await expect(card(page, id)).toHaveAttribute('data-selected', 'true');
}

async function draftPrimaryColor(page: Page): Promise<string> {
  await page.locator(COMMAND('branding')).click();
  return page.getByTestId('hotsite-primary-color').inputValue();
}

test.describe.serial('hotsite template picker (MANAGER)', () => {
  // Cleared before every test and set only once this test has captured the tenant's hotsite, so a
  // failed login can never write a previous test's snapshot back over the shared tenant.
  let original: HotsiteAdminContentResponse | undefined;

  test.beforeEach(async ({ page }) => {
    original = undefined;
    await loginAsStaff(page, MANAGER_EMAIL, SLUG);
    original = await getHotsiteConfig(page);
  });

  test.afterEach(async ({ page }) => {
    if (!original) return;
    await updateHotsiteConfig(page, toUpdateRequest(original));
    if (original.isPublished) await publishHotsite(page);
    else await unpublishHotsite(page);
  });

  test('applies Mimo Pet, then Origem, edits a service action, round-trips through the detailed editor, publishes, and the public site shows Origem with the tenant’s own identity', async ({
    page,
  }) => {
    await openVisualEditor(page);
    await openTemplates(page);

    // The six thumbnails come from the seeded shared bucket.
    await expect
      .poll(() =>
        page
          .locator('[data-testid="template-card"] img')
          .evaluateAll((imgs) =>
            imgs.every(
              (img) =>
                (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0,
            ),
          ),
      )
      .toBe(true);

    await applyTemplate(page, 'mimo-pet');
    await applyTemplate(page, 'origem');
    await expect(selectedCards(page)).toHaveCount(1);
    await expect(card(page, 'origem').getByTestId('template-selected-badge')).toBeVisible();

    // The applied images render in the draft preview, from the same bucket.
    const preview = page.getByTestId('hotsite-preview-content');
    await expect
      .poll(() =>
        preview
          .locator('img')
          .evaluateAll((imgs) =>
            imgs.some(
              (img) =>
                (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0,
            ),
          ),
      )
      .toBe(true);

    // Edit the service list so it opens booking, via the Organize modules inspector.
    await page.locator(COMMAND('structure')).click();
    await page
      .locator('[data-testid="layout-row-configure"][data-module-type="SERVICE_LIST"]')
      .click();
    await page.locator('[data-testid="service-list-item-action"][data-value="booking"]').click();
    await page.getByTestId('visual-inspector-apply').click();

    // The detailed editor shows the same selection and hands the same draft back.
    await enterDetailedEditor(page);
    await page.getByRole('tab', { name: 'Templates' }).click();
    await expect(selectedCards(page)).toHaveCount(1);
    await expect(card(page, 'origem')).toHaveAttribute('data-selected', 'true');
    await page.getByTestId('topbar-back-button').click();
    await expect(page.getByTestId('visual-editor')).toBeVisible();

    await page.locator(COMMAND('publish')).click();
    await expect(page.getByTestId('hotsite-action-success-banner')).toBeVisible();

    const saved = await getHotsiteConfig(page);
    const serviceList = saved.layout.find((module) => module.type === 'SERVICE_LIST');
    expect((serviceList?.data as { itemAction?: string }).itemAction).toBe('booking');
    expect(saved.branding.logoUrl).toBe(original!.branding.logoUrl);
    expect(saved.branding.brandName).toBe(original!.branding.brandName);

    await expect
      .poll(async () => (await getPublicManifest(page, SLUG)).branding.primaryColor)
      .toBe(saved.branding.primaryColor);
    await page.goto(`/${SLUG}`);
    await expect(page.locator('[data-testid="numbered-service"]').first()).toBeVisible();
  });

  test('applying Casa47 and refreshing before publishing leaves the saved site unchanged and highlights nothing', async ({
    page,
  }) => {
    await openVisualEditor(page);
    await openTemplates(page);
    await applyTemplate(page, 'casa47');

    await reloadEditor(page);

    const afterReload = await getHotsiteConfig(page);
    expect(afterReload.branding.primaryColor).toBe(original!.branding.primaryColor);
    expect(afterReload.layout.map((module) => module.type)).toEqual(
      original!.layout.map((module) => module.type),
    );
    await openTemplates(page);
    await expect(selectedCards(page)).toHaveCount(0);
  });

  test('applying Casa47, publishing, reloading and changing the brand colour saves again (the shared images survive a second save)', async ({
    page,
  }) => {
    await openVisualEditor(page);
    await openTemplates(page);
    await applyTemplate(page, 'casa47');
    await page.locator(COMMAND('publish')).click();
    await expect(page.getByTestId('hotsite-action-success-banner')).toBeVisible();

    await reloadEditor(page);
    await page.locator(COMMAND('branding')).click();
    await page.getByTestId('hotsite-primary-color').fill('#123456');
    await page.locator(COMMAND('publish')).click();

    await expect(page.getByTestId('hotsite-action-success-banner')).toBeVisible();
    expect((await getHotsiteConfig(page)).branding.primaryColor).toBe('#123456');
  });

  test('a dirty Hero edit asks before the Templates context opens; Cancel keeps it, Discard lets the gallery open', async ({
    page,
  }) => {
    await openVisualEditor(page);
    await page.locator('[data-testid="layout-row-configure"][data-module-type="HERO"]').click();
    await page.locator('#hero-title').fill('Título ainda não aplicado');

    await page.locator(COMMAND('templates')).click();
    await expect(page.getByTestId('visual-module-discard-confirm')).toBeVisible();
    await page.getByRole('button', { name: 'Continuar editando' }).click();
    await expect(page.locator('#hero-title')).toHaveValue('Título ainda não aplicado');
    await expect(page.getByTestId('template-gallery')).toHaveCount(0);

    await page.locator(COMMAND('templates')).click();
    await page.getByTestId('visual-module-discard-confirm').click();
    await expect(page.getByTestId('template-gallery')).toBeVisible();
  });

  test('a tenant with an uploaded hero image is asked before it is replaced; one without uploads is not', async ({
    page,
  }) => {
    await openVisualEditor(page);
    await openTemplates(page);
    // No uploads yet: applying needs no confirmation.
    await applyButton(page, 'origem').click();
    await expect(card(page, 'origem')).toHaveAttribute('data-selected', 'true');
    await expect(page.getByTestId('apply-template-dialog')).toHaveCount(0);

    // Upload a hero image, save it (so it is a stored upload, not a pending one), and reload.
    await reloadEditor(page);
    await page.locator('[data-testid="layout-row-configure"][data-module-type="HERO"]').click();
    await page.getByTestId('single-image-upload-input').setInputFiles({
      name: 'hero-banner.png',
      mimeType: 'image/png',
      buffer: HERO_PNG_BUFFER,
    });
    await expect(page.getByTestId('single-image-upload-preview')).toBeVisible();
    await page.getByTestId('visual-inspector-apply').click();
    await page.locator(COMMAND('publish')).click();
    await expect(page.getByTestId('hotsite-action-success-banner')).toBeVisible();
    await reloadEditor(page);

    await openTemplates(page);
    await applyButton(page, 'casa47').click();
    await expect(page.getByTestId('apply-template-dialog')).toBeVisible();

    await page.getByTestId('apply-template-cancel').click();
    await expect(selectedCards(page)).toHaveCount(0);

    await applyButton(page, 'casa47').click();
    await page.getByTestId('apply-template-confirm').click();
    await expect(card(page, 'casa47')).toHaveAttribute('data-selected', 'true');
  });

  test('Undo restores the previous presentation, and asks first when the draft was edited since', async ({
    page,
  }) => {
    await openVisualEditor(page);
    const originalColor = await draftPrimaryColor(page);
    await openTemplates(page);
    await applyTemplate(page, 'mimo-pet');

    await page.getByTestId('template-undo').click();
    await expect(selectedCards(page)).toHaveCount(0);
    expect(await draftPrimaryColor(page)).toBe(originalColor);

    await openTemplates(page);
    await applyTemplate(page, 'origem');
    await page.locator(COMMAND('branding')).click();
    await page.getByTestId('hotsite-primary-color').fill('#010203');
    await page.locator(COMMAND('templates')).click();

    await page.getByTestId('template-undo').click();
    await expect(page.getByRole('alertdialog')).toContainText('descarta as edições feitas depois');
    await page.getByTestId('template-undo-confirm').click();
    expect(await draftPrimaryColor(page)).toBe(originalColor);
  });

  test('enabling NAVIGATION, linking the Gallery and turning the Gallery off asks first, and confirming removes the link', async ({
    page,
  }) => {
    await openVisualEditor(page);
    const navigationRow = page.locator('[data-testid="layout-row"][data-module-type="NAVIGATION"]');
    await expect(navigationRow.getByTestId('layout-row-pinned')).toBeVisible();
    await expect(navigationRow.getByTestId('layout-row-drag')).toHaveCount(0);

    await page.locator('[data-testid="layout-row-toggle-GALLERY"][aria-checked="false"]').click();
    await page.getByTestId('layout-row-toggle-NAVIGATION').click();
    await page
      .locator('[data-testid="layout-row-configure"][data-module-type="NAVIGATION"]')
      .click();
    await page.getByTestId('navigation-add-item').click();
    await page.locator('#navigation-item-label-0').fill('Fotos');
    await page.locator('[data-testid="navigation-item-target-0"][data-value="gallery"]').click();
    await page.getByTestId('visual-inspector-apply').click();

    await page.getByTestId('layout-row-toggle-GALLERY').click();
    await expect(page.getByTestId('navigation-dependency-dialog')).toBeVisible();
    await page.getByTestId('navigation-dependency-confirm').click();

    await expect(page.getByTestId('layout-row-toggle-GALLERY')).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await page
      .locator('[data-testid="layout-row-configure"][data-module-type="NAVIGATION"]')
      .click();
    await expect(page.getByTestId('navigation-item')).toHaveCount(0);
  });
});
