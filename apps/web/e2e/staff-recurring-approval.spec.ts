import { expect, test } from '@playwright/test';
import { loginAsStaff } from './helpers/auth';
import { MANAGER_EMAIL, TENANT_SLUG } from './helpers/booking-form';
import {
  AGENDA_URL,
  createPendingRequest,
  decide,
  endApprovedSchedule,
  openRequestFromAgenda,
  recurringCard,
  rejectRequestViaApi,
  requestUrl,
} from './helpers/recurring-approval';
import {
  approveScheduleViaApi,
  listMySchedules,
  seedRecurrenceEligibleService,
  seedRecurringBundle,
} from './helpers/recurring-schedule';

// M23-S13 — UC-071: staff decides a recurring-schedule request from the Agenda. Every spec seeds its
// own MANUAL_APPROVAL service as the manager, has a fresh customer ask for a schedule through the
// API, and works on its own card only (the tenant is shared). A request that was approved is ended
// afterwards so its slots are released; one that was not is rejected.

test.describe('staff agenda: recurring-schedule requests (M23-S13, UC-071)', () => {
  test('approves a single-resource request from the card through the detail screen', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const service = await seedRecurrenceEligibleService(page, { approvalMode: 'MANUAL_APPROVAL' });
    const request = await createPendingRequest(browser, service.serviceId);
    const { id } = request.schedule;

    try {
      await openRequestFromAgenda(page, id);
      await expect(page.getByTestId('recurring-hold-banner')).toContainText('Decidir até');
      await expect(page.getByTestId('recurring-status-badge')).toContainText('Pendente');
      await expect(page.getByTestId('recurring-request-rows')).toContainText(service.name);

      await decide(page, 'approve');

      await expect(page.getByTestId(/^recurring-outcome-approved/)).toBeVisible();
      await expect(page.getByTestId('recurring-status-badge')).toContainText('Ativa');
      // The decision is settled: only the way back is left.
      await expect(page.getByRole('button', { name: 'Aprovar recorrência' })).toHaveCount(0);

      await page.getByRole('link', { name: 'Voltar à agenda' }).click();
      await expect(page).toHaveURL(new RegExp(`${AGENDA_URL}$`));
      await expect(recurringCard(page, id)).toHaveCount(0);

      const mine = (await listMySchedules(request.customerPage)).find((s) => s.id === id);
      expect(mine?.status).toBe('ACTIVE');
    } finally {
      await endApprovedSchedule(request, id).catch(() => undefined);
      await request.close();
    }
  });

  test('approves a bundle request (a chosen staff member + an automatic room)', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const bundle = await seedRecurringBundle(page, { approvalMode: 'MANUAL_APPROVAL' });
    const staff = bundle.staffs[0]!;
    const request = await createPendingRequest(browser, bundle.service.serviceId, {
      resourceSelections: [{ resourceType: 'STAFF', resourceId: staff.id }],
    });
    const { id } = request.schedule;

    try {
      await openRequestFromAgenda(page, id);
      // One row per requirement: the picked staff member by name, the room resolved per reservation.
      const rows = page.getByTestId('recurring-request-rows');
      await expect(rows).toContainText(staff.name);
      await expect(rows).toContainText('Resolvido a cada ocorrência');

      await decide(page, 'approve');

      await expect(page.getByTestId(/^recurring-outcome-approved/)).toBeVisible();
      const mine = (await listMySchedules(request.customerPage)).find((s) => s.id === id);
      expect(mine?.status).toBe('ACTIVE');
    } finally {
      await endApprovedSchedule(request, id).catch(() => undefined);
      await request.close();
    }
  });

  test('rejects a request with no reason and the request leaves the queue', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const service = await seedRecurrenceEligibleService(page, { approvalMode: 'MANUAL_APPROVAL' });
    const request = await createPendingRequest(browser, service.serviceId);
    const { id } = request.schedule;

    try {
      await openRequestFromAgenda(page, id);

      await page.getByRole('button', { name: 'Recusar', exact: true }).click();
      // No reason to type: the endpoint takes no body.
      await expect(page.getByRole('dialog').getByRole('textbox')).toHaveCount(0);
      await page.getByRole('dialog').getByRole('button', { name: 'Confirmar recusa' }).click();

      await expect(page.getByTestId('recurring-outcome-rejected')).toBeVisible();
      await expect(page.getByTestId('recurring-status-badge')).toContainText('Cancelada');

      await page.goto(AGENDA_URL);
      await expect(page.getByTestId('week-nav')).toBeVisible();
      await expect(recurringCard(page, id)).toHaveCount(0);
    } finally {
      await request.close();
    }
  });

  test('"Filtrar agenda" hides the recurrences, then everything, and "Limpar filtro" brings it back', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const service = await seedRecurrenceEligibleService(page, { approvalMode: 'MANUAL_APPROVAL' });
    const request = await createPendingRequest(browser, service.serviceId);
    const { id } = request.schedule;

    try {
      await page.goto(AGENDA_URL);
      await expect(recurringCard(page, id)).toBeVisible({ timeout: 20_000 });

      await page.getByRole('button', { name: 'Filtrar agenda' }).click();
      await page.getByRole('checkbox', { name: /Recorrências/ }).click();
      await expect(recurringCard(page, id)).toHaveCount(0);
      await expect(page.getByTestId('floating-filter-hidden-count')).toHaveText('1');

      // Hide the other three blocks too: the Agenda says everything is hidden.
      for (const name of [/Agendamentos/, /Hoje/, /Próximos dias/]) {
        await page.getByRole('checkbox', { name }).click();
      }
      await expect(page.getByTestId('agenda-all-hidden')).toBeVisible();

      await page.getByRole('button', { name: 'Limpar filtro' }).click();
      await expect(page.getByTestId('agenda-all-hidden')).toHaveCount(0);
      await expect(recurringCard(page, id)).toBeVisible();
    } finally {
      await rejectRequestViaApi(page, id).catch(() => undefined);
      await request.close();
    }
  });

  test('opens the approval route directly, pending and then decided (read-only)', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const service = await seedRecurrenceEligibleService(page, { approvalMode: 'MANUAL_APPROVAL' });
    const request = await createPendingRequest(browser, service.serviceId);
    const { id } = request.schedule;

    try {
      await page.goto(requestUrl(id));
      await expect(page.getByTestId('recurring-hold-banner')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Aprovar recorrência' })).toBeEnabled();

      await approveScheduleViaApi(page, id);

      // The same route now shows a decided request: its status, no deadline and no way to decide.
      await page.goto(requestUrl(id));
      await expect(page.getByTestId('recurring-status-badge')).toContainText('Ativa');
      await expect(page.getByTestId('recurring-hold-banner')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Aprovar|Recusar/ })).toHaveCount(0);
      await expect(page.getByTestId('recurring-settled-note')).toBeVisible();
    } finally {
      await endApprovedSchedule(request, id).catch(() => undefined);
      await request.close();
    }
  });
});
