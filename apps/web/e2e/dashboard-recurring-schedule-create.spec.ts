import { expect, test } from '@playwright/test';
import { loginAsStaff } from './helpers/auth';
import { MANAGER_EMAIL, TENANT_SLUG } from './helpers/booking-form';
import {
  createRecurringScheduleViaApi,
  desktopPane,
  listMySchedules,
  seedDefaultShapeRecurringService,
  seedRecurrenceEligibleService,
  seedRecurringBundle,
  tenantDate,
} from './helpers/recurring-schedule';
import { recurringCard } from './helpers/recurring-approval';
import {
  chooseCustomerForRecurrence,
  outcome,
  createStaffThroughForm,
  endAllSchedules,
  fillStaffPattern,
  seedCustomerWithPhone,
  seedCustomerWithoutPhone,
  startRecurrenceFromMenu,
  STAFF_PATTERN_PATH,
  submitStaffForm,
} from './helpers/recurring-staff-create';

// M23-S19 — UC-070: staff create a recurring private reservation on a customer's behalf, from the
// Agenda's "+ Novo → Recorrência". Each test seeds its own recurrence-eligible service (with its own
// room or staff) as the manager and uses a fresh customer, so the shared tenant never decides what a
// spec sees. Everything a spec created is ended through the customer's own session afterwards.

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const;

test.describe('staff dashboard: creating a recurring reservation for a customer (M23-S19, UC-070)', () => {
  test('"+ Novo → Recorrência" opens the shared customer step, which cannot take a new contact', async ({
    page,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);

    await startRecurrenceFromMenu(page);

    // A guest can never have a recurrence: the new-contact mode is disabled, with its reason.
    await expect(
      page.getByTestId('chooser-tab').filter({ hasText: 'Novo contato' }),
    ).toBeDisabled();
    await expect(page.getByTestId('customer-chooser')).toContainText(
      'Uma recorrência exige um cliente com conta',
    );
  });

  test('creates a schedule for an auto-confirm service, the customer finds it on their own list, and "Trocar cliente" returns to the chooser', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const service = await seedRecurrenceEligibleService(page);
    const customer = await seedCustomerWithPhone(browser);

    try {
      await startRecurrenceFromMenu(page);
      await chooseCustomerForRecurrence(page, customer.email);

      await expect(page.getByTestId('recipient-header')).toContainText(customer.email);
      await createStaffThroughForm(page, {
        service,
        weekdays: WEEKDAYS,
        startsOn: tenantDate(5),
        endsOn: tenantDate(18),
      });

      await expect(outcome(page, 'ACTIVE')).toContainText('Recorrência criada para');
      // The created schedule belongs to the chosen customer.
      const mine = await listMySchedules(customer.page);
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({ status: 'ACTIVE', serviceId: service.serviceId });

      // "Criar outra" starts the flow over at the customer step.
      await desktopPane(page).getByTestId('staff-schedule-create-another').click();
      await expect(page.getByTestId('customer-chooser')).toBeVisible();
    } finally {
      await endAllSchedules(customer.page);
      await customer.close();
    }
  });

  test('changing the customer from the pattern page goes back to the chooser', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    await seedRecurrenceEligibleService(page);
    const customer = await seedCustomerWithPhone(browser);

    try {
      await startRecurrenceFromMenu(page);
      await chooseCustomerForRecurrence(page, customer.email);

      await page.getByTestId('change-recipient').click();

      await expect(page).toHaveURL(/\/dashboard\/bookings\/new\?tipo=recorrencia$/);
      await expect(page.getByTestId('customer-chooser')).toBeVisible();
    } finally {
      await customer.close();
    }
  });

  test('the new schedule shows in the Agenda without a reload when staff come back to it from the form', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const service = await seedRecurrenceEligibleService(page);
    const customer = await seedCustomerWithPhone(browser);

    try {
      // Open the Agenda first, so its answer is cached, then go through the menu and come back by
      // clicking: a page.goto would reload the document and throw the cache away
      // (docs/ENGINEERING_RULES_FRONTEND.md § A mutation that changes server state owned by another feature).
      await page.goto('/dashboard/bookings');
      await expect(page.getByTestId('week-nav')).toBeVisible();
      const bookingLinks = page.locator(
        'a[href^="/dashboard/bookings/"]:not([href*="/new"]):not([href*="/recurring"])',
      );
      await expect(page.getByTestId('week-nav')).toBeVisible();
      const before = await bookingLinks.count();
      await page.getByTestId('new-menu-trigger').click();
      await page.locator('[data-testid="new-menu-item"][data-item="recorrencia"]').click();
      await chooseCustomerForRecurrence(page, customer.email);

      // The first occurrence is tomorrow, inside the Agenda's "Próximos dias" window.
      await createStaffThroughForm(page, {
        service,
        weekdays: WEEKDAYS,
        startsOn: tenantDate(1),
        endsOn: tenantDate(8),
      });
      await desktopPane(page).getByTestId('staff-schedule-back-to-agenda').click();

      await expect(page).toHaveURL(/\/dashboard\/bookings$/);
      // The occurrences created a moment ago appear without a reload.
      await expect.poll(() => bookingLinks.count(), { timeout: 20_000 }).toBeGreaterThan(before);
    } finally {
      await endAllSchedules(customer.page);
      await customer.close();
    }
  });

  test('a pattern that collides with seeded occupancy shows the conflict, creates nothing, and "Alterar padrão" keeps the pattern', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const service = await seedRecurrenceEligibleService(page);
    const holder = await seedCustomerWithPhone(browser);
    const customer = await seedCustomerWithPhone(browser);

    try {
      // The holder takes the service's only room at some start time.
      await createRecurringScheduleViaApi(holder.page, service.serviceId);
      const [held] = await listMySchedules(holder.page);
      const startTime = held!.recurrence.startTime;

      await startRecurrenceFromMenu(page);
      await chooseCustomerForRecurrence(page, customer.email);
      await fillStaffPattern(page, {
        service,
        weekdays: WEEKDAYS,
        startTime,
        startsOn: tenantDate(5),
        endsOn: tenantDate(8),
      });
      await submitStaffForm(page);

      const conflict = outcome(page, 'CONFLICT');
      await expect(conflict).toBeVisible();
      await expect(page.getByTestId('conflict-item').first()).toHaveAttribute(
        'data-reason',
        'OCCUPIED',
      );
      expect(await listMySchedules(customer.page)).toHaveLength(0);

      await desktopPane(page).getByTestId('staff-schedule-change-pattern').click();
      await expect(page.getByTestId('new-schedule-staff-form')).toBeVisible();
      await expect(page.getByTestId('new-schedule-ends-on')).not.toContainText('Escolher data');
      const pressed = await page
        .getByTestId('new-schedule-weekday')
        .evaluateAll(
          (pills) => pills.filter((p) => p.getAttribute('aria-pressed') === 'true').length,
        );
      expect(pressed).toBe(WEEKDAYS.length);
    } finally {
      await endAllSchedules(holder.page);
      await holder.close();
      await customer.close();
    }
  });

  test('a manual-approval service is created active straight away: the staff member is the approver', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const service = await seedRecurrenceEligibleService(page, { approvalMode: 'MANUAL_APPROVAL' });
    const customer = await seedCustomerWithPhone(browser);

    try {
      await startRecurrenceFromMenu(page);
      await chooseCustomerForRecurrence(page, customer.email);
      await createStaffThroughForm(page, {
        service,
        weekdays: WEEKDAYS,
        startsOn: tenantDate(5),
        endsOn: tenantDate(18),
      });

      await expect(outcome(page, 'ACTIVE')).toBeVisible();
      const [mine] = await listMySchedules(customer.page);
      expect(mine).toMatchObject({ status: 'ACTIVE', serviceId: service.serviceId });

      // Nothing waits for a decision: the Agenda has no recurrence card for it.
      await desktopPane(page).getByTestId('staff-schedule-back-to-agenda').click();
      await expect(page.getByTestId('week-nav')).toBeVisible();
      await expect(recurringCard(page, mine!.id)).toHaveCount(0);
    } finally {
      await endAllSchedules(customer.page);
      await customer.close();
    }
  });

  test('creates a staff + room bundle, picking the staff member, and the customer sees it; a conflict on the room alone creates nothing', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const bundle = await seedRecurringBundle(page);
    const holder = await seedCustomerWithPhone(browser);
    const customer = await seedCustomerWithPhone(browser);
    const other = await seedCustomerWithPhone(browser);

    try {
      await startRecurrenceFromMenu(page);
      await chooseCustomerForRecurrence(page, customer.email);
      await createStaffThroughForm(page, {
        service: bundle.service,
        weekdays: ['tuesday'],
        startsOn: tenantDate(5),
        endsOn: tenantDate(19),
        picks: [bundle.staffs[1]!.id],
      });
      await expect(outcome(page, 'ACTIVE')).toBeVisible();
      // One row per requirement: the picked staff member by name, the room resolved every week.
      const recap = page.getByTestId('staff-schedule-result');
      await expect(recap).toContainText(bundle.staffs[1]!.name);
      const mine = await listMySchedules(customer.page);
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({ status: 'ACTIVE', serviceId: bundle.service.serviceId });
      await endAllSchedules(customer.page);

      // The holder takes the only room with the second staff member; the other customer asks for
      // the free one at the same time, so only the room collides.
      await createRecurringScheduleViaApi(holder.page, bundle.service.serviceId, {
        resourceSelections: [{ resourceType: 'STAFF', resourceId: bundle.staffs[1]!.id }],
      });
      const [held] = await listMySchedules(holder.page);

      await startRecurrenceFromMenu(page);
      await chooseCustomerForRecurrence(page, other.email);
      await fillStaffPattern(page, {
        service: bundle.service,
        weekdays: WEEKDAYS,
        startTime: held!.recurrence.startTime,
        startsOn: tenantDate(5),
        endsOn: tenantDate(8),
        picks: [bundle.staffs[0]!.id],
      });
      await submitStaffForm(page);

      await expect(outcome(page, 'CONFLICT')).toBeVisible();
      await expect(page.getByTestId('conflict-item').first()).toHaveAttribute(
        'data-reason',
        'OCCUPIED',
      );
      expect(await listMySchedules(other.page)).toHaveLength(0);
    } finally {
      await endAllSchedules(customer.page);
      await endAllSchedules(holder.page);
      await holder.close();
      await customer.close();
      await other.close();
    }
  });

  test('a default-shape service shows no resource field and can be created', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const service = await seedDefaultShapeRecurringService(page, 'NO_REQUIREMENT');
    const customer = await seedCustomerWithPhone(browser);

    try {
      await startRecurrenceFromMenu(page);
      await chooseCustomerForRecurrence(page, customer.email);
      await page.getByTestId('new-schedule-service').click();
      await page.getByRole('option', { name: new RegExp(`^${service.name}`) }).click();
      await expect(page.getByTestId('new-schedule-resource')).toHaveCount(0);

      await createStaffThroughForm(page, {
        service,
        weekdays: WEEKDAYS,
        startsOn: tenantDate(5),
        endsOn: tenantDate(18),
      });

      await expect(outcome(page, 'ACTIVE')).toBeVisible();
      expect(await listMySchedules(customer.page)).toHaveLength(1);
    } finally {
      await endAllSchedules(customer.page);
      await customer.close();
    }
  });

  test('a customer with no phone on file shows the phone outcome and nothing is created', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const service = await seedRecurrenceEligibleService(page);
    const email = await seedCustomerWithoutPhone(browser);

    await startRecurrenceFromMenu(page);
    await chooseCustomerForRecurrence(page, email);
    await fillStaffPattern(page, {
      service,
      weekdays: WEEKDAYS,
      startTime: '11:00',
      startsOn: tenantDate(5),
      endsOn: tenantDate(18),
    });
    await submitStaffForm(page);

    await expect(outcome(page, 'PHONE_NOT_SET')).toContainText('não tem telefone cadastrado');
    // The way out is the customer step.
    await desktopPane(page).getByTestId('staff-schedule-choose-other').click();
    await expect(page.getByTestId('customer-chooser')).toBeVisible();
  });

  test('refuses a start in the past on the form with the pattern kept, and accepts a start today for staff', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const service = await seedRecurrenceEligibleService(page);
    const customer = await seedCustomerWithPhone(browser);

    try {
      await startRecurrenceFromMenu(page);
      await chooseCustomerForRecurrence(page, customer.email);

      // Today at 00:00 has already started: refused on the form, before anything is sent.
      await fillStaffPattern(page, {
        service,
        weekdays: WEEKDAYS,
        startTime: '00:00',
        startsOn: tenantDate(0),
        endsOn: tenantDate(0),
      });
      await submitStaffForm(page);
      await expect(page.getByTestId('new-schedule-notice')).toBeVisible();
      await expect(outcome(page, 'ACTIVE')).toHaveCount(0);
      expect(await listMySchedules(customer.page)).toHaveLength(0);

      // A start today, later in the day, is not refused as too soon: staff are exempt from the
      // minimum notice. What the backend answers is a created schedule or a slot/hours conflict,
      // never a booking-window refusal back on the form.
      await fillStaffPattern(page, {
        service,
        weekdays: WEEKDAYS,
        startTime: '23:30',
        startsOn: tenantDate(0),
        endsOn: tenantDate(7),
      });
      await submitStaffForm(page);
      await expect(outcome(page, 'ACTIVE').or(outcome(page, 'CONFLICT'))).toBeVisible();
      await expect(page.getByTestId('new-schedule-notice')).toHaveCount(0);
    } finally {
      await endAllSchedules(customer.page);
      await customer.close();
    }
  });

  test('the pattern page reached without a customer goes back to the chooser', async ({ page }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);

    await page.goto(STAFF_PATTERN_PATH);

    await expect(page).toHaveURL(/\/dashboard\/bookings\/new\?tipo=recorrencia$/);
    await expect(page.getByTestId('customer-chooser')).toBeVisible();
  });
});
