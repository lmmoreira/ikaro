import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { loginAsStaff } from './helpers/auth';
import { MANAGER_EMAIL, TENANT_SLUG } from './helpers/booking-form';
import {
  createService,
  deactivateService,
  makeUniqueServiceName,
  setServicePublicPage,
} from './helpers/services';

// TD56-S03 — a service's own public page (UC-013 A5 manager side, UC-109 visitor side). Every test
// creates its own uniquely named service on the shared lavacar-beloauto tenant and deactivates it
// afterwards, so nothing else's data is touched (and a stale slug can never clash on a rerun).
const STAFF_EMAIL = 'funcionario@lavacar.com.br';
const OTHER_TENANT_SLUG = 'autospa-premium';

async function newService(page: Page, prefix: string) {
  return createService(page, {
    name: makeUniqueServiceName(prefix),
    description: 'Descrição curta do serviço',
    priceAmount: 80,
    durationMinutes: 30,
    loyaltyPointsValue: 4,
  });
}

async function openPublicPageTab(page: Page, serviceId: string): Promise<void> {
  await page.goto(`/dashboard/services/${serviceId}/edit`);
  await page.locator('[data-testid="service-edit-tab"][data-tab="pagina"]').click();
  await expect(page.getByTestId('public-page-switch')).toBeVisible();
}

test.describe('service public page — manager publishes, visitor reads', () => {
  test('publishes from the Página pública tab, the visitor reads the page, goes back and enters booking', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const service = await newService(page, 'pagina-publica');

    try {
      await openPublicPageTab(page, service.serviceId);
      await expect(page.getByTestId('public-page-chip')).toHaveText('Não publicada');
      // Nothing is live yet: the link is disabled and is not an anchor.
      await expect(page.getByTestId('public-page-view-link')).toHaveCount(0);
      await expect(page.getByTestId('public-page-view-link-disabled')).toBeVisible();

      await page.getByTestId('public-page-switch').click();
      await page
        .getByTestId('public-page-description')
        .fill('Uma pausa para o corpo.\n\n- Acolhimento');
      await page.getByTestId('public-page-inclusion-add').click();
      await page.getByTestId('public-page-inclusion').fill('Chá de boas-vindas');
      await page
        .getByTestId('public-page-preparation')
        .fill('Chegue com 10 minutos de antecedência.');
      await page.getByTestId('service-desktop-tab-action').click();
      await expect(page.getByTestId('public-page-saved')).toBeVisible();

      // The link is live and opens in a NEW browser tab, so the editor stays where it is.
      const viewLink = page.getByTestId('public-page-view-link');
      await expect(viewLink).toHaveAttribute('target', '_blank');
      const href = (await viewLink.getAttribute('href')) ?? '';
      expect(href).toMatch(new RegExp(`^/${TENANT_SLUG}/servicos/[a-z0-9-]+$`));
      const [popup] = await Promise.all([page.waitForEvent('popup'), viewLink.click()]);
      await expect(popup).toHaveURL(new RegExp(`${href}$`));
      await expect(page).toHaveURL(new RegExp(`/dashboard/services/${service.serviceId}/edit`));
      await popup.close();

      // A visitor with no session reads the branded page.
      const visitor = await browser.newContext({
        baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
      });
      const guest = await visitor.newPage();
      try {
        await guest.goto(href);
        await expect(guest.getByRole('heading', { level: 1, name: service.name })).toBeVisible();
        await expect(guest.getByTestId('service-about')).toContainText('Uma pausa para o corpo.');
        await expect(guest.getByTestId('service-inclusions')).toContainText('Chá de boas-vindas');
        await expect(guest.getByTestId('service-preparation')).toContainText('10 minutos');
        await expect(guest.getByTestId('service-price')).toBeVisible();
        await expect(guest.locator('input[type="date"], input[type="time"]')).toHaveCount(0);

        // "Voltar aos serviços" returns to the services of the home page.
        await guest.getByTestId('service-back-link').click();
        await expect(guest).toHaveURL(new RegExp(`/${TENANT_SLUG}#service-list$`));

        // The booking button enters the service-first flow with exactly this service, no date.
        await guest.goto(href);
        await guest.getByTestId('service-book-cta').first().click();
        await expect(guest).toHaveURL(
          new RegExp(`/${TENANT_SLUG}/booking\\?serviceId=${service.serviceId}$`),
        );
      } finally {
        await visitor.close();
      }
    } finally {
      await deactivateService(page, service.serviceId);
    }
  });

  test('unpublishing from the tab makes the page unavailable at once, and the old URL is not served by another tenant', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const service = await newService(page, 'despublicar');
    const published = await setServicePublicPage(page, service.serviceId, {
      published: true,
      profile: { longDescription: 'Texto da página.' },
    });
    const pagePath = `/${TENANT_SLUG}/servicos/${published.publicSlug}`;

    try {
      const visitor = await browser.newContext({
        baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
      });
      const guest = await visitor.newPage();
      try {
        await guest.goto(pagePath);
        await expect(guest.getByRole('heading', { level: 1, name: service.name })).toBeVisible();

        await openPublicPageTab(page, service.serviceId);
        await expect(page.getByTestId('public-page-chip')).toHaveText('Publicada');
        await page.getByTestId('public-page-switch').click();
        await page.getByTestId('service-desktop-tab-action').click();
        await expect(page.getByTestId('public-page-saved')).toBeVisible();
        await expect(page.getByTestId('public-page-chip')).toHaveText('Não publicada');
        await expect(page.getByTestId('public-page-view-link')).toHaveCount(0);

        // Unpublished: the page is gone for the visitor (no redirect, the same unavailable page)…
        await guest.goto(pagePath);
        await expect(guest.getByTestId('service-detail-unavailable')).toBeVisible();
        // …and republishing brings back the very same URL.
        const republished = await setServicePublicPage(page, service.serviceId, {
          published: true,
        });
        expect(republished.publicSlug).toBe(published.publicSlug);
        await guest.goto(pagePath);
        await expect(guest.getByRole('heading', { level: 1, name: service.name })).toBeVisible();

        // Another tenant never serves this tenant's page, whatever the slug.
        await guest.goto(`/${OTHER_TENANT_SLUG}/servicos/${published.publicSlug}`);
        await expect(guest.getByTestId('service-detail-unavailable')).toBeVisible();
      } finally {
        await visitor.close();
      }
    } finally {
      await deactivateService(page, service.serviceId);
    }
  });

  test('a deactivated service has no page, even though its switch stays on', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const service = await newService(page, 'inativo');
    const published = await setServicePublicPage(page, service.serviceId, { published: true });
    await deactivateService(page, service.serviceId);

    const visitor = await browser.newContext({
      baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    });
    const guest = await visitor.newPage();
    try {
      await guest.goto(`/${TENANT_SLUG}/servicos/${published.publicSlug}`);
      await expect(guest.getByTestId('service-detail-unavailable')).toBeVisible();
    } finally {
      await visitor.close();
    }
  });

  test('the public page has no accessibility violations', async ({ page, browser }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const service = await newService(page, 'a11y');
    const published = await setServicePublicPage(page, service.serviceId, {
      published: true,
      profile: {
        longDescription: 'Texto **forte**.\n\n- um\n- dois',
        inclusions: ['Chá', 'Toalhas'],
        preparationNotes: 'Chegue cedo.',
      },
    });

    try {
      const visitor = await browser.newContext({
        baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
      });
      const guest = await visitor.newPage();
      try {
        await guest.goto(`/${TENANT_SLUG}/servicos/${published.publicSlug}`);
        await expect(guest.getByRole('heading', { level: 1, name: service.name })).toBeVisible();
        // The page itself (main): the shared top bar is rendered by every hotsite route and is
        // not this page's content, same scoping as the booking specs.
        const results = await new AxeBuilder({ page: guest }).include('main').analyze();
        expect(results.violations).toEqual([]);
      } finally {
        await visitor.close();
      }
    } finally {
      await deactivateService(page, service.serviceId);
    }
  });
});

test.describe('service public page — STAFF', () => {
  test('STAFF can publish and edit the text, but the image controls are locked', async ({
    page,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const service = await newService(page, 'equipe');
    await loginAsStaff(page, STAFF_EMAIL, TENANT_SLUG);

    try {
      await openPublicPageTab(page, service.serviceId);
      await expect(page.getByTestId('public-page-images-locked')).toContainText(
        'Somente gerentes podem enviar ou trocar as imagens',
      );
      await expect(page.getByTestId('single-image-upload-input')).toHaveCount(0);

      await page.getByTestId('public-page-switch').click();
      await page.getByTestId('public-page-preparation').fill('Texto da equipe.');
      await page.getByTestId('service-desktop-tab-action').click();
      await expect(page.getByTestId('public-page-saved')).toBeVisible();
      await expect(page.getByTestId('public-page-view-link')).toBeVisible();
    } finally {
      await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
      await deactivateService(page, service.serviceId);
    }
  });
});
