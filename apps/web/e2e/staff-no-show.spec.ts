import { expect, test, type Page } from '@playwright/test';
import { loginAsCustomer, loginAsStaff } from './helpers/auth';
import {
  createEndedApprovedBooking,
  createFreshApprovedBooking,
  createNoShowBooking,
} from './helpers/booking';
import { BFF_URL, WEB_INTERNAL_KEY } from './helpers/auth/shared';
import { postponeBooking } from './helpers/db/e2e-db';

// UC-074 — staff and managers mark an ended appointment as a no-show; a manager can correct it.
// An APPROVED booking whose end time has passed cannot be created through the API, so the
// `createEndedApprovedBooking` / `createNoShowBooking` helpers move a normally created booking
// into the past in the database; every action under test goes through the real UI and BFF.

const TENANT_SLUG = 'lavacar-beloauto';
const OTHER_TENANT_SLUG = 'autospa-premium';
const MANAGER_EMAIL = 'admin@lavacar.com.br';
const STAFF_EMAIL = 'funcionario@lavacar.com.br';
const OTHER_TENANT_MANAGER_EMAIL = 'admin@autospa.com.br';

const MARK_ACTION = 'Marcar não compareceu';
const CONFIRM_NO_SHOW = 'Confirmar não comparecimento';
const CORRECT_ACTION = 'Corrigir para concluído';
const CONFIRM_CORRECTION = 'Confirmar correção';

async function openBooking(page: Page, bookingId: string): Promise<void> {
  await page.goto(`/dashboard/bookings/${bookingId}`);
  await expect(page.getByTestId('booking-detail-page')).toBeVisible();
}

test.describe('staff no-show (UC-074)', () => {
  test('staff marks an ended appointment as a no-show with a reason and sees the inline state and history', async ({
    page,
  }) => {
    const setup = await createEndedApprovedBooking(page, 21, STAFF_EMAIL);
    await openBooking(page, setup.bookingId);

    await page.getByRole('button', { name: MARK_ACTION }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox').fill('Cliente não atendeu o telefone.');
    await dialog.getByRole('button', { name: CONFIRM_NO_SHOW }).click();

    await expect(page.getByTestId('booking-no-show-marked')).toBeVisible();
    await expect(page).toHaveURL(`/dashboard/bookings/${setup.bookingId}`);
    const history = page.getByTestId('booking-status-history');
    await expect(history).toBeVisible();
    await expect(history).toContainText('Aprovado → Não compareceu');
    await expect(history).toContainText('Equipe');
    await expect(history).toContainText('Motivo: Cliente não atendeu o telefone.');
    await expect(
      page.locator('main aside').getByRole('link', { name: 'Voltar à agenda' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: CORRECT_ACTION })).toHaveCount(0);
  });

  test('staff marks a no-show without a reason', async ({ page }) => {
    const setup = await createEndedApprovedBooking(page, 22, STAFF_EMAIL);
    await openBooking(page, setup.bookingId);

    await page.getByRole('button', { name: MARK_ACTION }).click();
    await page.getByRole('dialog').getByRole('button', { name: CONFIRM_NO_SHOW }).click();

    await expect(page.getByTestId('booking-no-show-marked')).toBeVisible();
    const history = page.getByTestId('booking-status-history');
    await expect(history).toContainText('Aprovado → Não compareceu');
    await expect(history).not.toContainText('Motivo:');
  });

  test('the action is disabled with the end-time hint while the appointment has not ended', async ({
    page,
  }) => {
    const setup = await createFreshApprovedBooking(page, 23, STAFF_EMAIL);
    await openBooking(page, setup.bookingId);

    const action = page.getByRole('button', { name: MARK_ACTION });
    await expect(action).toBeDisabled();
    await expect(page.getByTestId('no-show-hint')).toContainText(
      /Disponível após o término do atendimento \(\d{1,2}:\d{2}/,
    );
  });

  test('a stale screen whose appointment has not really ended gets the 422 banner and changes nothing', async ({
    page,
  }) => {
    const setup = await createEndedApprovedBooking(page, 24, STAFF_EMAIL);
    await openBooking(page, setup.bookingId);
    await expect(page.getByRole('button', { name: MARK_ACTION })).toBeEnabled();
    // The screen above believes the appointment is over; the server no longer agrees.
    await postponeBooking(setup.bookingId);

    await page.getByRole('button', { name: MARK_ACTION }).click();
    await page.getByRole('dialog').getByRole('button', { name: CONFIRM_NO_SHOW }).click();

    await expect(page.getByTestId('booking-no-show-not-ended')).toBeVisible();
    await expect(page.getByTestId('booking-status-history')).toHaveCount(0);
    await expect(page.getByRole('button', { name: MARK_ACTION })).toBeEnabled();
  });

  test('a booking someone else already closed gets the already-closed banner, and refresh shows its real state', async ({
    page,
  }) => {
    const setup = await createEndedApprovedBooking(page, 25, STAFF_EMAIL);
    await openBooking(page, setup.bookingId);
    // Another team member records the no-show while this screen is still open.
    await markNoShowThroughTheApi(page, setup.bookingId);

    await page.getByRole('button', { name: MARK_ACTION }).click();
    await page.getByRole('dialog').getByRole('button', { name: CONFIRM_NO_SHOW }).click();

    await expect(page.getByTestId('booking-no-show-terminal')).toBeVisible();
    await page.getByRole('button', { name: 'Atualizar' }).click();
    await expect(page.getByTestId('booking-no-show-terminal')).toHaveCount(0);
    await expect(page.getByTestId('booking-status-history')).toContainText('Não compareceu');
    await expect(page.getByRole('button', { name: MARK_ACTION })).toHaveCount(0);
  });

  test('a network failure shows the retry banner, changes nothing, and retrying succeeds', async ({
    page,
  }) => {
    const setup = await createEndedApprovedBooking(page, 30, STAFF_EMAIL);
    await openBooking(page, setup.bookingId);
    await page.route('**/v1/bookings/*/no-show', (route) => route.abort('failed'));

    await page.getByRole('button', { name: MARK_ACTION }).click();
    await page.getByRole('dialog').getByRole('button', { name: CONFIRM_NO_SHOW }).click();

    await expect(page.getByTestId('booking-no-show-error')).toBeVisible();
    await expect(page.getByTestId('booking-status-history')).toHaveCount(0);

    await page.unroute('**/v1/bookings/*/no-show');
    await page.getByRole('button', { name: 'Tentar novamente' }).click();
    await page.getByRole('dialog').getByRole('button', { name: CONFIRM_NO_SHOW }).click();

    await expect(page.getByTestId('booking-no-show-marked')).toBeVisible();
    await expect(page.getByTestId('booking-status-history')).toContainText(
      'Aprovado → Não compareceu',
    );
  });

  test('after a manager marks a no-show, reopening the booking offers the correction', async ({
    page,
  }) => {
    const setup = await createEndedApprovedBooking(page, 31, MANAGER_EMAIL);
    await openBooking(page, setup.bookingId);
    await page.getByRole('button', { name: MARK_ACTION }).click();
    await page.getByRole('dialog').getByRole('button', { name: CONFIRM_NO_SHOW }).click();
    await expect(page.getByTestId('booking-no-show-marked')).toBeVisible();
    await expect(page.getByTestId('booking-status-history')).toContainText('Gerente');

    // A fresh page in the same session: a full navigation away from a page that just closed a modal
    // dialog crashes headless Chromium against the dev server (it does the same after the existing
    // reject flow), which has nothing to do with what is under test.
    const reopened = await page.context().newPage();
    await reopened.goto(`/dashboard/bookings/${setup.bookingId}`);

    await expect(reopened.getByTestId('booking-no-show-title')).toBeVisible();
    await expect(reopened.getByRole('button', { name: CORRECT_ACTION })).toBeVisible();
  });

  test('a correction that fails on the network shows the retry banner and retrying succeeds', async ({
    page,
  }) => {
    const setup = await createNoShowBooking(page, 32, MANAGER_EMAIL);
    await openBooking(page, setup.bookingId);
    await page.route('**/v1/bookings/*/no-show/correct', (route) => route.abort('failed'));

    await page.getByRole('button', { name: CORRECT_ACTION }).click();
    await page
      .getByRole('dialog')
      .getByRole('textbox')
      .fill('Cliente chegou atrasado e foi atendido.');
    await page.getByRole('dialog').getByRole('button', { name: CONFIRM_CORRECTION }).click();

    await expect(page.getByTestId('booking-no-show-correct-error')).toBeVisible();
    // Still a no-show: the correction is offered again and nothing was completed.
    await expect(page.getByRole('button', { name: CORRECT_ACTION })).toBeVisible();

    await page.unroute('**/v1/bookings/*/no-show/correct');
    await page.getByRole('button', { name: 'Tentar novamente' }).click();
    await page
      .getByRole('dialog')
      .getByRole('textbox')
      .fill('Cliente chegou atrasado e foi atendido.');
    await page.getByRole('dialog').getByRole('button', { name: CONFIRM_CORRECTION }).click();

    await expect(page.getByTestId('booking-no-show-corrected')).toBeVisible();
  });

  test('a 403 on the correction shows the manager-only banner and leaves the no-show in place', async ({
    page,
  }) => {
    const setup = await createNoShowBooking(page, 33, MANAGER_EMAIL);
    await openBooking(page, setup.bookingId);
    await page.route('**/v1/bookings/*/no-show/correct', (route) =>
      route.fulfill({
        status: 403,
        contentType: 'application/problem+json',
        body: JSON.stringify({ status: 403, code: 'FORBIDDEN', detail: 'Forbidden' }),
      }),
    );

    await page.getByRole('button', { name: CORRECT_ACTION }).click();
    await page
      .getByRole('dialog')
      .getByRole('textbox')
      .fill('Cliente chegou atrasado e foi atendido.');
    await page.getByRole('dialog').getByRole('button', { name: CONFIRM_CORRECTION }).click();

    await expect(page.getByTestId('booking-no-show-correct-forbidden')).toBeVisible();
    // Still a no-show: the correction stays available and nothing was completed.
    await expect(page.getByRole('button', { name: CORRECT_ACTION })).toBeVisible();
    await expect(page.getByTestId('booking-status-history')).not.toContainText('→ Concluído');
  });

  test('a manager corrects a no-show to completed with a required reason and sees the points and the history', async ({
    page,
  }) => {
    const setup = await createNoShowBooking(page, 26, MANAGER_EMAIL);
    await openBooking(page, setup.bookingId);
    await expect(page.getByTestId('booking-status-history')).toContainText(
      'Motivo: Cliente não atendeu o telefone.',
    );

    await page.getByRole('button', { name: CORRECT_ACTION }).click();
    const dialog = page.getByRole('dialog');
    const confirm = dialog.getByRole('button', { name: CONFIRM_CORRECTION });
    await expect(confirm).toBeDisabled();
    await dialog.getByRole('textbox').fill('curto');
    await expect(confirm).toBeDisabled();
    await dialog.getByRole('textbox').fill('Cliente chegou atrasado e foi atendido.');
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect(page.getByTestId('booking-no-show-corrected')).toContainText(
      /recebeu \d+ pontos de fidelidade \(Lavagem Simples\)/,
    );
    const history = page.getByTestId('booking-status-history');
    await expect(history).toContainText('Aprovado → Não compareceu');
    await expect(history).toContainText('Não compareceu → Concluído');
    await expect(history).toContainText('Motivo: Cliente chegou atrasado e foi atendido.');
    await expect(page.getByRole('button', { name: CORRECT_ACTION })).toHaveCount(0);
  });

  test('a staff member opens a no-show booking and never sees the correction button', async ({
    page,
  }) => {
    const setup = await createNoShowBooking(page, 27, MANAGER_EMAIL);
    await loginAsStaff(page, STAFF_EMAIL, TENANT_SLUG);

    await openBooking(page, setup.bookingId);

    await expect(page.getByTestId('booking-no-show-title')).toBeVisible();
    await expect(page.getByTestId('booking-status-history')).toContainText('Gerente');
    await expect(page.getByTestId('no-show-read-only-note')).toBeVisible();
    await expect(page.getByRole('button', { name: CORRECT_ACTION })).toHaveCount(0);
    await expect(page.getByRole('button', { name: MARK_ACTION })).toHaveCount(0);
  });

  test('the customer sees the no-show in their history and a read-only detail without the internal reason', async ({
    page,
  }) => {
    const setup = await createNoShowBooking(
      page,
      28,
      MANAGER_EMAIL,
      'Motivo interno só para a equipe.',
    );
    await loginAsCustomer(page, setup.contactEmail, TENANT_SLUG);

    await page.goto(`/${TENANT_SLUG}/my-account/bookings`);
    const history = page.getByTestId('section-history');
    const row = history.locator(`a[href="/${TENANT_SLUG}/my-account/bookings/${setup.bookingId}"]`);
    await expect(row).toBeVisible();
    // The customer is created for this test, so the section holds this one booking.
    await expect(history).toContainText('Não compareceu');
    await row.click();

    await expect(page).toHaveURL(`/${TENANT_SLUG}/my-account/bookings/${setup.bookingId}`);
    await expect(page.getByTestId('booking-no-show-notice')).toContainText(
      'Não comparecimento registrado',
    );
    await expect(page.getByTestId('booking-no-show-notice')).toContainText(
      'Se foi um engano, entre em contato com o estabelecimento.',
    );
    await expect(page.getByRole('button', { name: /cancelar/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /reagendar/i })).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('Motivo interno só para a equipe.');
  });

  test("another tenant's manager cannot open the booking (tenant isolation)", async ({ page }) => {
    const setup = await createNoShowBooking(page, 29, MANAGER_EMAIL);
    await loginAsStaff(page, OTHER_TENANT_MANAGER_EMAIL, OTHER_TENANT_SLUG);

    await page.goto(`/dashboard/bookings/${setup.bookingId}`);

    await expect(page.getByTestId('not-found-heading')).toBeVisible();
    await expect(page.getByTestId('booking-status-history')).toHaveCount(0);
  });
});

// Another team member's request, made with whatever session the page currently holds.
async function markNoShowThroughTheApi(page: Page, bookingId: string): Promise<void> {
  const res = await page.request.post(`${BFF_URL}/bookings/${bookingId}/no-show`, {
    data: {},
    headers: { 'X-Web-Internal-Key': WEB_INTERNAL_KEY! },
  });
  if (!res.ok()) throw new Error(`mark no-show failed: ${res.status()} ${await res.text()}`);
}
