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
  seedResource,
  selectService,
  slotsOnDate,
  stepIndicator,
  TENANT_SLUG,
} from './helpers/booking-form';
import {
  createService,
  deactivateService,
  makeUniqueServiceName,
  setResourceRequirements,
  setServiceLegs,
} from './helpers/services';

// M23-S11a — UC-062/063/065: automatic resources have no picker step; a journey asks for one pick
// per leg that has a choice.

async function newGuestPage(browser: Browser): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
  });
  return { page: await context.newPage(), close: () => context.close() };
}

async function seedService(page: Page, prefix: string, durationMinutes = 60) {
  return createService(page, {
    name: makeUniqueServiceName(prefix),
    priceAmount: 150,
    durationMinutes,
    loyaltyPointsValue: 10,
  });
}

async function finishGuestBooking(guest: Page): Promise<void> {
  await pickFirstSlot(guest);
  await nextButton(guest).click();
  await fillGuestContact(guest);
  await nextButton(guest).click();
  await confirmBooking(guest);
}

test.describe('M23-S11a — automatic resources', () => {
  test('auto-any staff: no picker step, and the details box names the staff member the system assigned', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const staff = await seedResource(page, 'STAFF');
    const service = await seedService(page, 'e2e-auto-any');
    await setResourceRequirements(page, service.serviceId, [
      { type: 'STAFF', selectionMode: 'AUTO_ANY', resourcePoolIds: [staff.id] },
    ]);
    const guest = await newGuestPage(browser);

    try {
      await openBooking(guest.page);
      await selectService(guest.page, service.serviceId);
      await nextButton(guest.page).click();

      await expect(stepIndicator(guest.page, 2, 4)).toBeVisible();
      await expect(guest.page.getByTestId('resource-picker')).toHaveCount(0);
      await finishGuestBooking(guest.page);

      await expect(guest.page.getByTestId('booking-success')).toBeVisible();
      await expect(guest.page.getByTestId('submitted-resource')).toContainText(staff.name);
    } finally {
      await guest.close();
      await deactivateService(page, service.serviceId);
      await deactivateResource(page, staff.id);
    }
  });

  test('fungible pool: no picker step, no unit name; a slot is hidden only once every unit is booked', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const roomA = await seedResource(page, 'ROOM');
    const roomB = await seedResource(page, 'ROOM');
    const service = await seedService(page, 'e2e-pool');
    await setResourceRequirements(page, service.serviceId, [
      {
        type: 'ROOM',
        selectionMode: 'AUTO_FUNGIBLE_POOL',
        resourcePoolIds: [roomA.id, roomB.id],
        requiredQuantity: 1,
      },
    ]);
    // The pool's write path assigns its first eligible unit, so each unit is taken through its own
    // single-unit service: occupancy is per resource, whichever service booked it.
    const takers = [roomA, roomB].map(async (room) => {
      const taker = await seedService(page, 'e2e-pool-taker');
      await setResourceRequirements(page, taker.serviceId, [
        { type: 'ROOM', selectionMode: 'AUTO_FUNGIBLE_POOL', resourcePoolIds: [room.id] },
      ]);
      return taker;
    });
    const [takerA, takerB] = await Promise.all(takers);
    const slot = await findFirstSlot(page, service.serviceId);
    const guest = await newGuestPage(browser);

    try {
      expect(
        await bookAsGuest(page, { serviceIds: [takerA!.serviceId], scheduledAt: slot.startsAt }),
      ).toBe(201);
      const afterOne = await slotsOnDate(page, service.serviceId, slot.date);
      expect(afterOne.some((s) => s.startsAt === slot.startsAt)).toBe(true);

      expect(
        await bookAsGuest(page, { serviceIds: [takerB!.serviceId], scheduledAt: slot.startsAt }),
      ).toBe(201);
      const afterBoth = await slotsOnDate(page, service.serviceId, slot.date);
      expect(afterBoth.some((s) => s.startsAt === slot.startsAt)).toBe(false);

      await openBooking(guest.page);
      await selectService(guest.page, service.serviceId);
      await nextButton(guest.page).click();
      await expect(stepIndicator(guest.page, 2, 4)).toBeVisible();
      await expect(guest.page.getByTestId('resource-picker')).toHaveCount(0);
      await guest.page.locator(`[data-testid="day-option"][data-date="${slot.date}"]`).click();
      await expect(guest.page.getByTestId('time-slot')).toHaveCount(afterBoth.length);

      await guest.page.getByTestId('time-slot').first().click();
      await nextButton(guest.page).click();
      await fillGuestContact(guest.page);
      await nextButton(guest.page).click();
      await confirmBooking(guest.page);

      await expect(guest.page.getByTestId('booking-success')).toBeVisible();
      await expect(guest.page.getByTestId('submitted-resource')).toHaveCount(0);
    } finally {
      await guest.close();
      await deactivateService(page, service.serviceId);
      await deactivateService(page, takerA!.serviceId);
      await deactivateService(page, takerB!.serviceId);
      await deactivateResource(page, roomA.id);
      await deactivateResource(page, roomB.id);
    }
  });

  test('a pool that needs two units books normally', async ({ page, browser }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const roomA = await seedResource(page, 'ROOM');
    const roomB = await seedResource(page, 'ROOM');
    const service = await seedService(page, 'e2e-pool-two');
    await setResourceRequirements(page, service.serviceId, [
      {
        type: 'ROOM',
        selectionMode: 'AUTO_FUNGIBLE_POOL',
        resourcePoolIds: [roomA.id, roomB.id],
        requiredQuantity: 2,
      },
    ]);
    const guest = await newGuestPage(browser);

    try {
      await openBooking(guest.page);
      await selectService(guest.page, service.serviceId);
      await nextButton(guest.page).click();
      await expect(stepIndicator(guest.page, 2, 4)).toBeVisible();
      await finishGuestBooking(guest.page);

      await expect(guest.page.getByTestId('booking-success')).toBeVisible();
    } finally {
      await guest.close();
      await deactivateService(page, service.serviceId);
      await deactivateResource(page, roomA.id);
      await deactivateResource(page, roomB.id);
    }
  });
});

test.describe('M23-S11a — journey (multi-leg) picks', () => {
  async function seedJourney(page: Page) {
    const room = await seedResource(page, 'ROOM');
    const staffs = [await seedResource(page, 'STAFF'), await seedResource(page, 'STAFF')];
    const equipments = [
      await seedResource(page, 'EQUIPMENT'),
      await seedResource(page, 'EQUIPMENT'),
    ];
    const service = await seedService(page, 'e2e-jornada', 70);
    await setServiceLegs(page, service.serviceId, [
      {
        legIndex: 0,
        name: 'Sauna',
        durationMinutes: 20,
        resourceRequirements: [
          { type: 'ROOM', selectionMode: 'AUTO_ANY', resourcePoolIds: [room.id] },
        ],
      },
      {
        legIndex: 1,
        name: 'Massagem',
        durationMinutes: 30,
        resourceRequirements: [
          {
            type: 'STAFF',
            selectionMode: 'CUSTOMER_CHOICE',
            resourcePoolIds: staffs.map((s) => s.id),
          },
        ],
      },
      {
        legIndex: 2,
        name: 'Relaxamento',
        durationMinutes: 20,
        resourceRequirements: [
          {
            type: 'EQUIPMENT',
            selectionMode: 'CUSTOMER_CHOICE',
            resourcePoolIds: equipments.map((e) => e.id),
          },
        ],
      },
    ]);
    return { service, room, staffs, equipments };
  }

  test('one picker step per leg that has a choice, headed by the leg name; earlier picks survive Back; the booking completes', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const { service, room, staffs, equipments } = await seedJourney(page);
    const guest = await newGuestPage(browser);

    try {
      await openBooking(guest.page);
      await selectService(guest.page, service.serviceId);
      await nextButton(guest.page).click();

      await expect(stepIndicator(guest.page, 2, 6)).toBeVisible();
      await expect(guest.page.getByRole('heading', { name: 'Massagem' })).toBeVisible();
      await expect(guest.page.getByTestId('picker-subtitle')).toContainText(
        'Etapa 2 de 3 da jornada',
      );
      await guest.page.locator(`[data-resource-id="${staffs[0]!.id}"]`).click();
      await nextButton(guest.page).click();

      await expect(stepIndicator(guest.page, 3, 6)).toBeVisible();
      await expect(guest.page.getByRole('heading', { name: 'Relaxamento' })).toBeVisible();
      await guest.page.locator(`[data-resource-id="${equipments[1]!.id}"]`).click();
      await guest.page.getByRole('button', { name: 'Voltar' }).click();
      await expect(guest.page.locator(`[data-resource-id="${staffs[0]!.id}"] input`)).toBeChecked();
      await nextButton(guest.page).click();
      await expect(
        guest.page.locator(`[data-resource-id="${equipments[1]!.id}"] input`),
      ).toBeChecked();
      await nextButton(guest.page).click();

      await finishGuestBooking(guest.page);
      await expect(guest.page.getByTestId('booking-success')).toBeVisible();
    } finally {
      await guest.close();
      await deactivateService(page, service.serviceId);
      for (const id of [room.id, ...staffs.map((s) => s.id), ...equipments.map((e) => e.id)]) {
        await deactivateResource(page, id);
      }
    }
  });

  test('a mocked LEG_UNAVAILABLE response returns to availability with the catalogue message', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const { service, room, staffs, equipments } = await seedJourney(page);
    const guest = await newGuestPage(browser);
    await guest.page.route('**/v1/bookings', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 409,
            contentType: 'application/problem+json',
            body: JSON.stringify({
              type: 'about:blank',
              title: 'Conflict',
              status: 409,
              code: 'BOOKING_LEG_UNAVAILABLE',
              detail: 'leg',
            }),
          })
        : route.continue(),
    );

    try {
      await openBooking(guest.page);
      await selectService(guest.page, service.serviceId);
      await nextButton(guest.page).click();
      await guest.page.locator(`[data-resource-id="${staffs[0]!.id}"]`).click();
      await nextButton(guest.page).click();
      await guest.page.locator(`[data-resource-id="${equipments[0]!.id}"]`).click();
      await nextButton(guest.page).click();
      await finishGuestBooking(guest.page);

      await expect(guest.page.getByTestId('step2-error')).toContainText(
        'Uma das etapas deste agendamento não está mais disponível.',
      );
      await expect(nextButton(guest.page)).toBeDisabled();
    } finally {
      await guest.close();
      await deactivateService(page, service.serviceId);
      for (const id of [room.id, ...staffs.map((s) => s.id), ...equipments.map((e) => e.id)]) {
        await deactivateResource(page, id);
      }
    }
  });
});

export type { ResourceSelectionItem };
