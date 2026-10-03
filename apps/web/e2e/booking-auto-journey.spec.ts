import { expect, test, type Browser, type Page } from '@playwright/test';
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
    const takerIds: string[] = [];
    const slot = await findFirstSlot(page, service.serviceId);
    const guest = await newGuestPage(browser);

    try {
      for (const room of [roomA, roomB]) {
        const taker = await seedService(page, 'e2e-pool-taker');
        takerIds.push(taker.serviceId);
        await setResourceRequirements(page, taker.serviceId, [
          { type: 'ROOM', selectionMode: 'AUTO_FUNGIBLE_POOL', resourcePoolIds: [room.id] },
        ]);
      }
      const [takerA, takerB] = takerIds as [string, string];
      expect(await bookAsGuest(page, { serviceIds: [takerA], scheduledAt: slot.startsAt })).toBe(
        201,
      );
      const afterOne = await slotsOnDate(page, service.serviceId, slot.date);
      expect(afterOne.some((s) => s.startsAt === slot.startsAt)).toBe(true);

      expect(await bookAsGuest(page, { serviceIds: [takerB], scheduledAt: slot.startsAt })).toBe(
        201,
      );
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
      for (const id of takerIds) await deactivateService(page, id);
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

test.describe('M23-S11a — automatic and selectable resources together', () => {
  async function cleanup(page: Page, serviceId: string, resourceIds: readonly string[]) {
    await deactivateService(page, serviceId);
    for (const id of resourceIds) await deactivateResource(page, id);
  }

  test('a flat service with a chosen staff member and an automatic room asks only for the staff member', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const staffs = [await seedResource(page, 'STAFF'), await seedResource(page, 'STAFF')];
    const room = await seedResource(page, 'ROOM');
    const service = await seedService(page, 'e2e-misto-plano');
    await setResourceRequirements(page, service.serviceId, [
      { type: 'STAFF', selectionMode: 'CUSTOMER_CHOICE', resourcePoolIds: staffs.map((s) => s.id) },
      { type: 'ROOM', selectionMode: 'AUTO_ANY', resourcePoolIds: [room.id] },
    ]);
    const guest = await newGuestPage(browser);

    try {
      await openBooking(guest.page);
      await selectService(guest.page, service.serviceId);
      await nextButton(guest.page).click();

      await expect(stepIndicator(guest.page, 2, 5)).toBeVisible();
      await expect(guest.page.getByTestId('picker-section')).toHaveCount(1);
      await expect(guest.page.getByTestId('picker-section')).toHaveAttribute(
        'data-resource-type',
        'STAFF',
      );
      await guest.page.locator(`[data-resource-id="${staffs[1]!.id}"]`).click();
      await nextButton(guest.page).click();
      await finishGuestBooking(guest.page);

      await expect(guest.page.getByTestId('booking-success')).toBeVisible();
      const rows = guest.page.getByTestId('submitted-resource');
      await expect(rows).toHaveCount(2);
      await expect(rows.filter({ hasText: staffs[1]!.name })).toHaveCount(1);
      await expect(rows.filter({ hasText: room.name })).toHaveCount(1);
    } finally {
      await guest.close();
      await cleanup(page, service.serviceId, [...staffs.map((s) => s.id), room.id]);
    }
  });

  test('a journey whose first leg mixes an automatic room and a chosen staff member shows one section there, skips the automatic leg and asks for the last', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const roomAuto = await seedResource(page, 'ROOM');
    const roomMid = await seedResource(page, 'ROOM');
    const staffs = [await seedResource(page, 'STAFF'), await seedResource(page, 'STAFF')];
    const equipments = [
      await seedResource(page, 'EQUIPMENT'),
      await seedResource(page, 'EQUIPMENT'),
    ];
    const service = await seedService(page, 'e2e-misto-jornada', 70);
    await setServiceLegs(page, service.serviceId, [
      {
        legIndex: 0,
        name: 'Sauna',
        durationMinutes: 20,
        resourceRequirements: [
          { type: 'ROOM', selectionMode: 'AUTO_ANY', resourcePoolIds: [roomAuto.id] },
          {
            type: 'STAFF',
            selectionMode: 'CUSTOMER_CHOICE',
            resourcePoolIds: staffs.map((s) => s.id),
          },
        ],
      },
      {
        legIndex: 1,
        name: 'Banho',
        durationMinutes: 30,
        resourceRequirements: [
          { type: 'ROOM', selectionMode: 'AUTO_ANY', resourcePoolIds: [roomMid.id] },
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
    const guest = await newGuestPage(browser);

    try {
      await openBooking(guest.page);
      await selectService(guest.page, service.serviceId);
      await nextButton(guest.page).click();

      await expect(stepIndicator(guest.page, 2, 6)).toBeVisible();
      await expect(guest.page.getByTestId('picker-heading')).toHaveText('Sauna');
      await expect(guest.page.getByTestId('picker-section')).toHaveCount(1);
      await expect(guest.page.getByTestId('picker-section')).toHaveAttribute(
        'data-resource-type',
        'STAFF',
      );
      await guest.page.locator(`[data-resource-id="${staffs[0]!.id}"]`).click();
      await nextButton(guest.page).click();

      // Leg 2 ("Banho") is fully automatic: no step of its own.
      await expect(stepIndicator(guest.page, 3, 6)).toBeVisible();
      await expect(guest.page.getByTestId('picker-heading')).toHaveText('Relaxamento');
      await guest.page.locator(`[data-resource-id="${equipments[0]!.id}"]`).click();
      await nextButton(guest.page).click();

      await finishGuestBooking(guest.page);
      await expect(guest.page.getByTestId('booking-success')).toBeVisible();
    } finally {
      await guest.close();
      await cleanup(page, service.serviceId, [
        roomAuto.id,
        roomMid.id,
        ...staffs.map((s) => s.id),
        ...equipments.map((e) => e.id),
      ]);
    }
  });

  test('a journey whose every leg is automatic goes straight from the services to the date step', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const room = await seedResource(page, 'ROOM');
    const staff = await seedResource(page, 'STAFF');
    const equipment = await seedResource(page, 'EQUIPMENT');
    const service = await seedService(page, 'e2e-jornada-auto', 70);
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
          { type: 'STAFF', selectionMode: 'AUTO_ANY', resourcePoolIds: [staff.id] },
        ],
      },
      {
        legIndex: 2,
        name: 'Relaxamento',
        durationMinutes: 20,
        resourceRequirements: [
          { type: 'EQUIPMENT', selectionMode: 'AUTO_ANY', resourcePoolIds: [equipment.id] },
        ],
      },
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
    } finally {
      await guest.close();
      await cleanup(page, service.serviceId, [room.id, staff.id, equipment.id]);
    }
  });
});
