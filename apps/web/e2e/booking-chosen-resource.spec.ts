import { expect, test, type Browser, type Page } from '@playwright/test';
import type { ResourceSelectionItem } from '@ikaro/types';
import { loginAsStaff } from './helpers/auth';
import { deactivateResource } from './helpers/booking';
import {
  bookAsGuest,
  confirmBooking,
  fillGuestContact,
  findFirstSlot,
  MANAGER_EMAIL,
  nextButton,
  openBooking,
  pickFirstSlot,
  seedChoiceService,
  seedResource,
  selectService,
  slotsOnDate,
  stepIndicator,
  TENANT_SLUG,
} from './helpers/booking-form';
import { createService, deactivateService, makeUniqueServiceName } from './helpers/services';
import { setResourceRequirements } from './helpers/services';

// M23-S11a — UC-061/064/066: the customer chooses the resource(s) of a service. Seeded with
// freshly created resources restricted into the requirement's pool, so the shared tenant's other
// resources never reach the picker. The manager seeds on `page`; the guest uses its own context.

async function newGuestPage(browser: Browser): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
  });
  return { page: await context.newPage(), close: () => context.close() };
}

const staffPick = (serviceId: string, resourceId: string): ResourceSelectionItem => ({
  serviceId,
  legIndex: null,
  resourceType: 'STAFF',
  resourceId,
});

test.describe('M23-S11a — chosen resource', () => {
  test('guest picks a staff member: nothing pre-selected, only that staff member’s slots, details box names the pick', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const seeded = await seedChoiceService(page);
    const [staffA, staffB] = seeded.resourceIds as [string, string];
    const slot = await findFirstSlot(page, seeded.serviceId, [staffPick(seeded.serviceId, staffA)]);
    expect(
      await bookAsGuest(page, {
        serviceIds: [seeded.serviceId],
        scheduledAt: slot.startsAt,
        resourceSelections: [staffPick(seeded.serviceId, staffA)],
      }),
    ).toBe(201);
    const guest = await newGuestPage(browser);

    try {
      await openBooking(guest.page);
      await selectService(guest.page, seeded.serviceId);
      await nextButton(guest.page).click();

      await expect(stepIndicator(guest.page, 2, 5)).toBeVisible();
      await expect(guest.page.getByTestId('resource-picker')).toBeVisible();
      await expect(guest.page.getByRole('radio', { checked: true })).toHaveCount(0);
      await expect(nextButton(guest.page)).toBeDisabled();

      await guest.page.locator(`[data-resource-id="${staffA}"]`).click();
      await nextButton(guest.page).click();
      await guest.page.locator(`[data-testid="day-option"][data-date="${slot.date}"]`).click();
      await expect(guest.page.getByTestId('time-slot').first()).toBeVisible();
      const slotsForA = await guest.page.getByTestId('time-slot').count();

      await guest.page.getByRole('button', { name: 'Voltar' }).click();
      await expect(guest.page.locator(`[data-resource-id="${staffA}"] input`)).toBeChecked();
      await guest.page.locator(`[data-resource-id="${staffB}"]`).click();
      await nextButton(guest.page).click();
      await guest.page.locator(`[data-testid="day-option"][data-date="${slot.date}"]`).click();
      await expect(guest.page.getByTestId('time-slot').first()).toBeVisible();
      const slotsForB = await guest.page.getByTestId('time-slot').count();
      expect(slotsForB).toBeGreaterThan(slotsForA);

      await guest.page.getByTestId('time-slot').first().click();
      await nextButton(guest.page).click();
      await fillGuestContact(guest.page);
      await nextButton(guest.page).click();
      await confirmBooking(guest.page);

      await expect(guest.page.getByTestId('booking-success')).toBeVisible();
      await expect(guest.page.getByTestId('submitted-resource')).toBeVisible();
      await expect(guest.page.getByTestId('booking-submitted-details')).toContainText(seeded.name);
    } finally {
      await guest.close();
      await deactivateService(page, seeded.serviceId);
      for (const id of seeded.resourceIds) await deactivateResource(page, id);
    }
  });

  test('an inactive staff member is not offered', async ({ page, browser }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const seeded = await seedChoiceService(page);
    const [active, inactive] = seeded.resourceIds as [string, string];
    await deactivateResource(page, inactive);
    const guest = await newGuestPage(browser);

    try {
      await openBooking(guest.page);
      await selectService(guest.page, seeded.serviceId);
      await nextButton(guest.page).click();

      await expect(guest.page.getByTestId('picker-option')).toHaveCount(1);
      await expect(guest.page.locator(`[data-resource-id="${active}"]`)).toBeVisible();
      await expect(guest.page.locator(`[data-resource-id="${inactive}"]`)).toHaveCount(0);
    } finally {
      await guest.close();
      await deactivateService(page, seeded.serviceId);
      await deactivateResource(page, active);
    }
  });

  test('a service with no active resource to offer stays on Step 1 as unavailable', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const seeded = await seedChoiceService(page, 1);
    await deactivateResource(page, seeded.resourceIds[0]!);
    const guest = await newGuestPage(browser);

    try {
      await openBooking(guest.page);
      await selectService(guest.page, seeded.serviceId);
      await nextButton(guest.page).click();

      await expect(guest.page.getByTestId('service-unavailable')).toContainText(
        'Este serviço não está disponível para reserva no momento.',
      );
      await expect(stepIndicator(guest.page, 1, 4)).toBeVisible();
      await expect(nextButton(guest.page)).toBeDisabled();
      await expect(guest.page.getByTestId('resource-picker')).toHaveCount(0);
    } finally {
      await guest.close();
      await deactivateService(page, seeded.serviceId);
    }
  });

  test('a pick that stops being offered after the picker re-prompts it with the pick cleared', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const seeded = await seedChoiceService(page);
    const [picked, other] = seeded.resourceIds as [string, string];
    const guest = await newGuestPage(browser);

    try {
      await openBooking(guest.page);
      await selectService(guest.page, seeded.serviceId);
      await nextButton(guest.page).click();
      await guest.page.locator(`[data-resource-id="${picked}"]`).click();
      await nextButton(guest.page).click();
      await pickFirstSlot(guest.page);
      await nextButton(guest.page).click();
      await fillGuestContact(guest.page);
      await nextButton(guest.page).click();

      await deactivateResource(page, picked);
      await confirmBooking(guest.page);

      await expect(guest.page.getByTestId('picker-reselect-error')).toContainText(
        'Não há recursos ativos do tipo selecionado.',
      );
      await expect(guest.page.getByRole('radio', { checked: true })).toHaveCount(0);
      await expect(guest.page.locator(`[data-resource-id="${other}"]`)).toBeVisible();
      await expect(nextButton(guest.page)).toBeDisabled();
    } finally {
      await guest.close();
      await deactivateService(page, seeded.serviceId);
      await deactivateResource(page, other);
    }
  });

  test('a flat service with staff and room choices shows both sections on one screen and lists only slots where both picks are free', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const staffA = await seedResource(page, 'STAFF');
    const staffB = await seedResource(page, 'STAFF');
    const room = await seedResource(page, 'ROOM');
    const service = await createService(page, {
      name: makeUniqueServiceName('e2e-bundle'),
      priceAmount: 150,
      durationMinutes: 60,
      loyaltyPointsValue: 10,
    });
    await setResourceRequirements(page, service.serviceId, [
      { type: 'STAFF', selectionMode: 'CUSTOMER_CHOICE', resourcePoolIds: [staffA.id, staffB.id] },
      { type: 'ROOM', selectionMode: 'CUSTOMER_CHOICE', resourcePoolIds: [room.id] },
    ]);
    const picksFor = (staffId: string): ResourceSelectionItem[] => [
      staffPick(service.serviceId, staffId),
      { serviceId: service.serviceId, legIndex: null, resourceType: 'ROOM', resourceId: room.id },
    ];
    const slot = await findFirstSlot(page, service.serviceId, picksFor(staffA.id));
    // Staff A takes the room for that slot: staff B is free but the room is not, so the
    // intersection must hide it for staff B too.
    expect(
      await bookAsGuest(page, {
        serviceIds: [service.serviceId],
        scheduledAt: slot.startsAt,
        resourceSelections: picksFor(staffA.id),
      }),
    ).toBe(201);
    const expected = await slotsOnDate(page, service.serviceId, slot.date, picksFor(staffB.id));
    const guest = await newGuestPage(browser);

    try {
      await openBooking(guest.page);
      await selectService(guest.page, service.serviceId);
      await nextButton(guest.page).click();

      await expect(stepIndicator(guest.page, 2, 5)).toBeVisible();
      await expect(guest.page.getByTestId('picker-section')).toHaveCount(2);
      await guest.page.locator(`[data-resource-id="${staffB.id}"]`).click();
      await expect(nextButton(guest.page)).toBeDisabled();
      await guest.page.locator(`[data-resource-id="${room.id}"]`).click();
      await nextButton(guest.page).click();

      await guest.page.locator(`[data-testid="day-option"][data-date="${slot.date}"]`).click();
      await expect(guest.page.getByTestId('time-slot').first()).toBeVisible();
      await expect(guest.page.getByTestId('time-slot')).toHaveCount(expected.length);
      expect(expected.some((s) => s.startsAt === slot.startsAt)).toBe(false);
    } finally {
      await guest.close();
      await deactivateService(page, service.serviceId);
      for (const id of [staffA.id, staffB.id, room.id]) await deactivateResource(page, id);
    }
  });

  test('a room-only choice is headed by the room', async ({ page, browser }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const seeded = await seedChoiceService(page, 2, 'ROOM');
    const guest = await newGuestPage(browser);

    try {
      await openBooking(guest.page);
      await selectService(guest.page, seeded.serviceId);
      await nextButton(guest.page).click();

      await expect(guest.page.getByRole('heading', { name: 'Escolha a sala' })).toBeVisible();
    } finally {
      await guest.close();
      await deactivateService(page, seeded.serviceId);
      for (const id of seeded.resourceIds) await deactivateResource(page, id);
    }
  });

  test('a room taken after the slot list loaded returns to availability with the catalogue message and the slot cleared', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const staff = await seedResource(page, 'STAFF');
    const room = await seedResource(page, 'ROOM');
    const service = await createService(page, {
      name: makeUniqueServiceName('e2e-bundle-race'),
      priceAmount: 150,
      durationMinutes: 60,
      loyaltyPointsValue: 10,
    });
    await setResourceRequirements(page, service.serviceId, [
      { type: 'STAFF', selectionMode: 'CUSTOMER_CHOICE', resourcePoolIds: [staff.id] },
      { type: 'ROOM', selectionMode: 'CUSTOMER_CHOICE', resourcePoolIds: [room.id] },
    ]);
    const guest = await newGuestPage(browser);

    try {
      await openBooking(guest.page);
      await selectService(guest.page, service.serviceId);
      await nextButton(guest.page).click();
      await guest.page.locator(`[data-resource-id="${staff.id}"]`).click();
      await guest.page.locator(`[data-resource-id="${room.id}"]`).click();
      await nextButton(guest.page).click();
      await pickFirstSlot(guest.page);
      const chosen = await findFirstSlot(page, service.serviceId, [
        staffPick(service.serviceId, staff.id),
        { serviceId: service.serviceId, legIndex: null, resourceType: 'ROOM', resourceId: room.id },
      ]);
      await nextButton(guest.page).click();
      await fillGuestContact(guest.page);
      await nextButton(guest.page).click();

      // Another customer takes the room (alone) for the slot the guest is about to submit.
      expect(
        await bookAsGuest(page, {
          serviceIds: [service.serviceId],
          scheduledAt: chosen.startsAt,
          resourceSelections: [
            staffPick(service.serviceId, staff.id),
            {
              serviceId: service.serviceId,
              legIndex: null,
              resourceType: 'ROOM',
              resourceId: room.id,
            },
          ],
        }),
      ).toBe(201);
      await confirmBooking(guest.page);

      await expect(guest.page.getByTestId('step2-error')).toBeVisible();
      await expect(nextButton(guest.page)).toBeDisabled();
    } finally {
      await guest.close();
      await deactivateService(page, service.serviceId);
      await deactivateResource(page, staff.id);
      await deactivateResource(page, room.id);
    }
  });
});
