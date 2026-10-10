import { expect, test } from '@playwright/test';
import { loginAsStaff } from './helpers/auth';
import { MANAGER_EMAIL, TENANT_SLUG } from './helpers/booking-form';
import { newLoggedInCustomerPage } from './helpers/availability-alert';
import {
  createRecurringScheduleViaApi,
  createThroughForm,
  fillRecurringForm,
  desktopPane,
  listMySchedules,
  NEW_SCHEDULE_PATH,
  seedRecurrenceEligibleService,
  submitRecurringForm,
  tenantDate,
  weekdayOf,
} from './helpers/recurring-schedule';
import { createScheduleClosureAt, removeScheduleClosure } from './helpers/schedule';

// M23-S17 — UC-070: the customer creates a recurring private reservation from Minha Conta. One
// route holds the pattern, its review and every outcome. Each test seeds its own recurrence-eligible
// service (with its own room) as the manager and acts as a fresh customer in a separate context.

const LIST_URL = `/${TENANT_SLUG}/my-account/recurring-schedules`;
const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const;

test.describe('customer my-account: creating a recurring reservation (M23-S17, UC-070)', () => {
  test('creates a schedule for an auto-confirm service and finds it on the list', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const service = await seedRecurrenceEligibleService(page);
    const customer = await newLoggedInCustomerPage(browser);

    try {
      await customer.page.goto(NEW_SCHEDULE_PATH);
      await createThroughForm(
        customer.page,
        {
          service,
          weekdays: WEEKDAYS,
          startsOn: tenantDate(5),
          endsOn: tenantDate(18),
        },
        'new-schedule-created',
      );

      await expect(customer.page.getByTestId('new-schedule-created')).toContainText(
        'Recorrência criada',
      );

      await desktopPane(customer.page).getByTestId('new-schedule-view').click();
      await expect(customer.page).toHaveURL(new RegExp(`${LIST_URL}/[0-9a-f-]{36}$`));

      await customer.page.goto(LIST_URL);
      const active = customer.page.getByTestId('section-active');
      await expect(active.getByTestId('recurring-schedule-row')).toHaveCount(1);
      await expect(active).toContainText(service.name);
    } finally {
      await customer.close();
    }
  });

  test('a service that needs approval lands on "em análise" and the schedule is listed as pending', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const service = await seedRecurrenceEligibleService(page, { approvalMode: 'MANUAL_APPROVAL' });
    const customer = await newLoggedInCustomerPage(browser);

    try {
      await customer.page.goto(NEW_SCHEDULE_PATH);
      await createThroughForm(
        customer.page,
        { service, weekdays: WEEKDAYS, startsOn: tenantDate(5), endsOn: tenantDate(18) },
        'recurring-schedule-pending',
      );

      const pending = customer.page.getByTestId('recurring-schedule-pending');
      await expect(pending).toContainText('Estamos analisando seu pedido de recorrência');
      await expect(pending).toContainText('protegido');

      await customer.page.goto(LIST_URL);
      await expect(
        customer.page.getByTestId('section-pending').getByTestId('recurring-schedule-row'),
      ).toHaveCount(1);
    } finally {
      await customer.close();
    }
  });

  test('a pattern that collides with an existing schedule lists the occurrence, creates nothing, and "Alterar padrão" keeps the pattern', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const service = await seedRecurrenceEligibleService(page);
    const holder = await newLoggedInCustomerPage(browser);
    const customer = await newLoggedInCustomerPage(browser);

    try {
      // The holder takes the service's only room on weekday mornings for four weeks.
      await createRecurringScheduleViaApi(holder.page, service.serviceId);
      const [held] = await listMySchedules(holder.page);
      const startTime = held!.recurrence.startTime;

      await customer.page.goto(NEW_SCHEDULE_PATH);
      await fillRecurringForm(customer.page, {
        service,
        weekdays: WEEKDAYS,
        startTime,
        startsOn: tenantDate(5),
        endsOn: tenantDate(8),
      });
      await submitRecurringForm(customer.page);

      const conflict = customer.page.getByTestId('new-schedule-conflict');
      await expect(conflict).toBeVisible();
      await expect(conflict.getByTestId('conflict-item').first()).toHaveAttribute(
        'data-reason',
        'OCCUPIED',
      );
      expect(await listMySchedules(customer.page)).toHaveLength(0);

      await desktopPane(customer.page).getByTestId('new-schedule-change-pattern').click();
      await expect(customer.page.getByTestId('new-schedule-form')).toBeVisible();
      await expect(
        customer.page.locator('[data-testid="new-schedule-weekday"][aria-pressed="true"]'),
      ).toHaveCount(WEEKDAYS.length);
    } finally {
      await holder.close();
      await customer.close();
    }
  });

  test('a day the service room is closed is listed as "Fechado" and nothing is created', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const service = await seedRecurrenceEligibleService(page);
    const closedDay = tenantDate(6);
    const closure = await createScheduleClosureAt(page, closedDay, {
      reason: 'MAINTENANCE',
      resourceId: service.roomId,
    });
    const customer = await newLoggedInCustomerPage(browser);

    try {
      await customer.page.goto(NEW_SCHEDULE_PATH);
      await fillRecurringForm(customer.page, {
        service,
        weekdays: [weekdayOf(closedDay)],
        startTime: '11:00',
        startsOn: tenantDate(5),
        endsOn: tenantDate(12),
      });
      await submitRecurringForm(customer.page);

      const item = customer.page
        .getByTestId('new-schedule-conflict')
        .locator('[data-testid="conflict-item"][data-reason="CLOSED"]');
      await expect(item).toHaveCount(1);
      await expect(item).toContainText('Fechado');
      expect(await listMySchedules(customer.page)).toHaveLength(0);
    } finally {
      await removeScheduleClosure(page, closure.id);
      await customer.close();
    }
  });

  test('both entry points open the form, and "today" comes from the tenant calendar', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    await seedRecurrenceEligibleService(page);
    const customer = await newLoggedInCustomerPage(browser);

    try {
      // The topbar menu is on every my-account screen; two triggers exist in the page (topbar,
      // and the mobile one the viewport hides), so the visible one is addressed.
      await customer.page.goto(LIST_URL);
      await expect(customer.page.getByTestId('recurring-schedules-empty')).toBeVisible();
      await customer.page.locator('[data-testid="new-menu-trigger"]:visible').click();
      await customer.page.getByTestId('new-menu-recurring').click();
      await expect(customer.page).toHaveURL(NEW_SCHEDULE_PATH);

      // The empty state's own call to action.
      await customer.page.goto(LIST_URL);
      await customer.page.getByTestId('recurring-schedules-empty-cta').click();
      await expect(customer.page).toHaveURL(NEW_SCHEDULE_PATH);

      // "Today" is the tenant's: yesterday is not selectable, today is.
      await customer.page.getByTestId('new-schedule-starts-on').click();
      await expect(customer.page.locator(`[data-day="${tenantDate(0)}"] button`)).toBeEnabled();
      await expect(customer.page.locator(`[data-day="${tenantDate(-1)}"] button`)).toBeDisabled();
    } finally {
      await customer.close();
    }
  });

  test('on a phone-sized screen the empty Agendamentos tab offers the menu and its recurring item opens the form', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    await seedRecurrenceEligibleService(page);
    const customer = await newLoggedInCustomerPage(browser);

    try {
      await customer.page.setViewportSize({ width: 390, height: 800 });
      await customer.page.goto(`/${TENANT_SLUG}/my-account/bookings`);

      // A fresh customer has no bookings: the menu sits above the empty state.
      await expect(customer.page.getByTestId('mobile-new-menu')).toBeVisible();
      await customer.page.locator('[data-testid="new-menu-trigger"]:visible').click();
      await customer.page.getByTestId('new-menu-recurring').click();
      await expect(customer.page).toHaveURL(NEW_SCHEDULE_PATH);
    } finally {
      await customer.close();
    }
  });
});
