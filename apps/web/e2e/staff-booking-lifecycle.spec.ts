import { expect, test, type Page } from '@playwright/test';

const TENANT_SLUG = 'lavacar-beloauto';
const STAFF_EMAIL = 'lm.moreira@gmail.com';
const BFF_URL = process.env.PLAYWRIGHT_BFF_URL ?? 'http://127.0.0.1:3002/v1';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
const SERVICE_SIMPLES_ID = '00000000-0000-7000-8003-000000000001';

if (!INTERNAL_API_KEY) {
  throw new Error('INTERNAL_API_KEY is required for staff booking lifecycle E2E coverage');
}

interface DevLoginResponse {
  readonly accessToken: string;
  readonly user: {
    readonly sub: string;
    readonly tenantId: string;
    readonly tenantSlug: string;
    readonly role: 'CUSTOMER' | 'STAFF' | 'MANAGER';
  };
}

async function loginAsCustomer(page: Page, email: string, tenantSlug: string): Promise<void> {
  const res = await page.request.post(`${BFF_URL}/auth/dev-login`, {
    headers: { 'X-Internal-Key': INTERNAL_API_KEY! },
    data: { email, tenantSlug, type: 'customer' },
  });
  if (!res.ok()) throw new Error(`dev-login failed: ${res.status()} ${await res.text()}`);
  const body = (await res.json()) as DevLoginResponse;

  await page.context().addCookies([
    {
      name: 'access_token',
      value: body.accessToken,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

async function loginAsStaff(page: Page, email: string, tenantSlug: string): Promise<void> {
  const res = await page.request.post(`${BFF_URL}/auth/dev-login`, {
    headers: { 'X-Internal-Key': INTERNAL_API_KEY! },
    data: { email, tenantSlug, type: 'staff' },
  });
  if (!res.ok()) throw new Error(`dev-login failed: ${res.status()} ${await res.text()}`);
  const body = (await res.json()) as DevLoginResponse;

  await page.context().addCookies([
    {
      name: 'access_token',
      value: body.accessToken,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

function uniqueTestEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}@e2e.example.com`;
}

function hashSeed(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

async function completeCustomerProfile(page: Page, tenantSlug: string): Promise<void> {
  await page.request.patch(`${BFF_URL}/customers/me`, {
    headers: { 'X-Tenant-Slug': tenantSlug },
    data: {
      phone: '+5511999999999',
      defaultAddress: {
        street: 'Rua das Acácias',
        number: '45',
        neighborhood: 'Jardim América',
        city: 'Belo Horizonte',
        state: 'MG',
        zipCode: '30130-020',
      },
    },
  });
}

function parseDayOffset(daysAhead: number, seed: string): string {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  const slotIndex = hashSeed(seed) % 12;
  date.setHours(8 + Math.floor(slotIndex / 2), (slotIndex % 2) * 30, 0, 0);
  return date.toISOString();
}

async function createAuthenticatedBooking(
  page: Page,
  options: {
    readonly tenantSlug: string;
    readonly emailPrefix: string;
    readonly daysAhead: number;
    readonly serviceIds?: readonly string[];
    readonly notes?: string;
  },
): Promise<{
  readonly bookingId: string;
  readonly scheduledAt: string;
  readonly contactEmail: string;
}> {
  const contactEmail = uniqueTestEmail(options.emailPrefix);
  await loginAsCustomer(page, contactEmail, options.tenantSlug);
  await completeCustomerProfile(page, options.tenantSlug);
  const serviceIds = options.serviceIds ?? [SERVICE_SIMPLES_ID];
  let lastError: string | null = null;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const scheduledAt = parseDayOffset(options.daysAhead, `${contactEmail}:${attempt}`);
    const res = await page.request.post(`${BFF_URL}/bookings/authenticated`, {
      data: {
        scheduledAt,
        serviceIds,
        ...(options.notes ? { notes: options.notes } : {}),
      },
    });

    if (res.ok()) {
      const body = (await res.json()) as { bookingId: string; scheduledAt: string };
      return {
        bookingId: body.bookingId,
        scheduledAt: body.scheduledAt,
        contactEmail,
      };
    }

    const errorText = await res.text();
    if (res.status() !== 409) {
      throw new Error(`authenticated booking setup failed: ${res.status()} ${errorText}`);
    }
    lastError = errorText;
  }

  throw new Error(
    `authenticated booking setup failed after retrying available slots: ${lastError ?? '409 conflict'}`,
  );
}

async function loginAsStaffAndApproveBooking(
  page: Page,
  bookingId: string,
  staffEmail = STAFF_EMAIL,
): Promise<void> {
  await loginAsStaff(page, staffEmail, TENANT_SLUG);

  const res = await page.request.patch(`${BFF_URL}/bookings/${bookingId}/approve`, {
    data: {},
  });

  if (!res.ok()) {
    throw new Error(`approve booking failed: ${res.status()} ${await res.text()}`);
  }
}

async function createFreshApprovedBooking(page: Page, daysAhead: number) {
  const setup = await createAuthenticatedBooking(page, {
    tenantSlug: TENANT_SLUG,
    emailPrefix: `lifecycle-${daysAhead}`,
    daysAhead,
  });

  await loginAsStaffAndApproveBooking(page, setup.bookingId);
  return setup;
}

test.describe('staff booking lifecycle coverage', () => {
  test('queue card body still opens booking detail', async ({ page }) => {
    const setup = await createAuthenticatedBooking(page, {
      tenantSlug: TENANT_SLUG,
      emailPrefix: 'queue-detail',
      daysAhead: 7,
    });

    await loginAsStaff(page, STAFF_EMAIL, TENANT_SLUG);
    await page.goto('/dashboard/bookings');

    await page.locator(`a[href="/dashboard/bookings/${setup.bookingId}"]`).click();

    await expect(page).toHaveURL(`/dashboard/bookings/${setup.bookingId}`);
    await expect(page.getByRole('button', { name: 'Aprovar' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pedir info' })).toBeVisible();
  });

  test('queue quick approve keeps the staff on the queue and removes the pending action', async ({
    page,
  }) => {
    const setup = await createAuthenticatedBooking(page, {
      tenantSlug: TENANT_SLUG,
      emailPrefix: 'queue-approve',
      daysAhead: 8,
    });

    await loginAsStaff(page, STAFF_EMAIL, TENANT_SLUG);
    await page.goto('/dashboard/bookings');

    const card = page
      .locator(`a[href="/dashboard/bookings/${setup.bookingId}"]`)
      .locator('xpath=..');
    await expect(card.getByRole('button', { name: 'Aprovar' })).toBeVisible();

    await card.getByRole('button', { name: 'Aprovar' }).click();

    await expect(page).toHaveURL('/dashboard/bookings');
    await expect(card.getByRole('button', { name: 'Aprovar' })).toHaveCount(0);
  });

  test('reject happy path shows the inline rejection summary and the right-side action panel', async ({
    page,
  }) => {
    const setup = await createAuthenticatedBooking(page, {
      tenantSlug: TENANT_SLUG,
      emailPrefix: 'reject',
      daysAhead: 9,
    });

    await loginAsStaff(page, STAFF_EMAIL, TENANT_SLUG);
    await page.goto(`/dashboard/bookings/${setup.bookingId}`);

    await page.getByRole('button', { name: 'Rejeitar' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox').fill('Cliente pediu reagendamento para outra data');
    await dialog.getByRole('button', { name: 'Rejeitar' }).click();

    await expect(page.getByText('Agendamento rejeitado')).toBeVisible();
    await expect(page.getByText(/Motivo registrado:/i)).toBeVisible();
    await expect(
      page.getByText(/O cliente foi notificado por email com o motivo da rejeição/i),
    ).toBeVisible();
    await expect(
      page.locator('main aside').getByRole('link', { name: 'Voltar à agenda' }),
    ).toBeVisible();
  });

  test('request info happy path shows the inline info-request summary and the right-side action panel', async ({
    page,
  }) => {
    const setup = await createAuthenticatedBooking(page, {
      tenantSlug: TENANT_SLUG,
      emailPrefix: 'request-info',
      daysAhead: 10,
    });

    await loginAsStaff(page, STAFF_EMAIL, TENANT_SLUG);
    await page.goto(`/dashboard/bookings/${setup.bookingId}`);

    await page.getByRole('button', { name: 'Pedir info' }).click();
    const dialog = page.getByRole('dialog');
    await dialog
      .getByRole('textbox')
      .fill('Confirme o endereço de coleta antes do horário agendado.');
    await dialog.getByRole('button', { name: 'Enviar' }).click();

    await expect(page.getByText('Solicitação de informação enviada')).toBeVisible();
    await expect(page.getByText(/Pergunta enviada:/i)).toBeVisible();
    await expect(
      page.getByText(/Quando o cliente responder, o agendamento volta para Pendente/i),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Aprovar' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rejeitar' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pedir info' })).toHaveCount(0);
  });

  test('complete success shows the centered summary and the right-side action panel', async ({
    page,
  }) => {
    const setup = await createFreshApprovedBooking(page, 9);

    await page.goto(`/dashboard/bookings/${setup.bookingId}/complete`);

    await expect(page.getByRole('button', { name: 'Confirmar conclusão' })).toBeVisible();
    await expect(page.getByText('Lavagem Simples')).toBeVisible();
    await expect(page.getByText(/Total cotado:/i)).toBeVisible();
    await expect(page.getByText(/Total cobrado:/i)).toBeVisible();

    await page.getByRole('button', { name: 'Confirmar conclusão' }).click();

    await expect(page.getByText('Serviço concluído')).toBeVisible();
    await expect(
      page.locator('main aside').getByRole('link', { name: 'Voltar à agenda' }),
    ).toBeVisible();
    await expect(page.getByText(/Email com resumo enviado/i)).toBeVisible();
  });

  test('reschedule success shows a full De/Para summary and the action panel on the right', async ({
    page,
  }) => {
    const setup = await createFreshApprovedBooking(page, 10);

    await page.goto(`/dashboard/bookings/${setup.bookingId}/reschedule`);

    const desktopAside = page.locator('main aside');
    await expect(desktopAside).toContainText('Ainda não selecionado');

    await page.locator('[data-testid="day-option"]:not([disabled])').last().click();
    await page.locator('[data-testid="time-slot"]').first().click();

    await expect(desktopAside).toContainText('De');
    await expect(desktopAside).toContainText('Para');
    await expect(desktopAside).not.toContainText('Ainda não selecionado');

    await page.getByRole('button', { name: 'Reagendar' }).click();

    await expect(page.getByText(/Agendamento reagendado/i)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ver detalhe atualizado' })).toBeVisible();
    await expect(page.getByText(/recebeu um email com o novo horário/i)).toBeVisible();
    await expect(
      page.locator('main aside').getByRole('link', { name: 'Voltar à agenda' }),
    ).toBeVisible();
  });

  test('cancel success keeps the message centered and the back action in the right panel', async ({
    page,
  }) => {
    const setup = await createFreshApprovedBooking(page, 11);

    await page.goto(`/dashboard/bookings/${setup.bookingId}`);

    await page.getByRole('button', { name: 'Cancelar agendamento' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Cancelar agendamento' }).click();

    await expect(page.getByText(/Agendamento cancelado/i)).toBeVisible();
    await expect(page.getByText(/foi avisado por email do cancelamento/i)).toBeVisible();
    await expect(
      page.locator('main aside').getByRole('link', { name: 'Voltar à agenda' }),
    ).toBeVisible();
  });
});
