import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import type { ResourceSelectionItem } from '@ikaro/types';
import { loginAsStaff } from './helpers/auth';
import { deactivateResource } from './helpers/booking';
import {
  applyDarkHotsitePalette,
  bookAsGuest,
  confirmBooking,
  fillGuestContact,
  findFirstSlot,
  MANAGER_EMAIL,
  nextButton,
  openBooking,
  parseRange,
  seedBundle,
  seedFixedService,
  seedJourney,
  seedResource,
  seedVariableDurationService,
  selectService,
  stepIndicator,
  TENANT_SLUG,
  type SeededJourney,
} from './helpers/booking-form';
import {
  createService,
  deactivateService,
  makeUniqueServiceName,
  setResourceRequirements,
} from './helpers/services';

// M23-S11b — UC-064/065: bundle and journey review, the journey timeline in the success box, and
// baskets that combine a journey, a bundle, a fixed service and a variable-duration one.

async function newGuestPage(browser: Browser): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
  });
  return { page: await context.newPage(), close: () => context.close() };
}

async function cleanup(page: Page, serviceIds: readonly string[], resourceIds: readonly string[]) {
  for (const id of serviceIds) await deactivateService(page, id);
  for (const id of resourceIds) await deactivateResource(page, id);
}

// Picks the first bookable day's first slot and returns its start in minutes since midnight.
async function pickSlotAndRead(guest: Page): Promise<number> {
  const day = guest.locator('[data-testid="day-option"]:not([disabled])').first();
  await expect(day).toBeVisible();
  await day.click();
  const slot = guest.getByTestId('time-slot').first();
  await expect(slot).toBeVisible();
  const { start } = parseRange((await slot.textContent()) ?? '');
  await slot.click();
  return start;
}

async function toConfirmation(guest: Page): Promise<number> {
  const slotStart = await pickSlotAndRead(guest);
  await nextButton(guest).click();
  await fillGuestContact(guest);
  await nextButton(guest).click();
  return slotStart;
}

async function pickJourneyChoices(guest: Page, journey: SeededJourney): Promise<void> {
  await guest.locator(`[data-resource-id="${journey.staffs[0]!.id}"]`).click();
  await nextButton(guest).click();
  await guest.locator(`[data-resource-id="${journey.equipments[0]!.id}"]`).click();
  await nextButton(guest).click();
}

async function ranges(items: Locator, inner: string): Promise<{ start: number; end: number }[]> {
  const texts = await items.locator(inner).allTextContents();
  return texts.map(parseRange);
}

function journeyPicks(journey: SeededJourney): ResourceSelectionItem[] {
  return [
    {
      serviceId: journey.service.serviceId,
      legIndex: 1,
      resourceType: 'STAFF',
      resourceId: journey.staffs[0]!.id,
    },
    {
      serviceId: journey.service.serviceId,
      legIndex: 2,
      resourceType: 'EQUIPMENT',
      resourceId: journey.equipments[0]!.id,
    },
  ];
}

test.describe('M23-S11b — bundle', () => {
  test('a bundle asks only for its staff member, names that pick in the review and the details box, and never a room', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const bundle = await seedBundle(page);
    const guest = await newGuestPage(browser);

    try {
      await openBooking(guest.page);
      await selectService(guest.page, bundle.service.serviceId);
      await nextButton(guest.page).click();

      await expect(stepIndicator(guest.page, 2, 5)).toBeVisible();
      await expect(guest.page.getByTestId('picker-section')).toHaveCount(1);
      await expect(guest.page.getByTestId('picker-section')).toHaveAttribute(
        'data-resource-type',
        'STAFF',
      );
      await guest.page.locator(`[data-resource-id="${bundle.staffs[0]!.id}"]`).click();
      await nextButton(guest.page).click();
      await toConfirmation(guest.page);

      await expect(guest.page.getByTestId('line-own-pick')).toContainText(bundle.staffs[0]!.name);
      await expect(guest.page.getByTestId('basket-lines')).not.toContainText(bundle.room.name);
      await confirmBooking(guest.page);

      await expect(guest.page.getByTestId('booking-success')).toBeVisible();
      const rows = guest.page.getByTestId('submitted-resource');
      await expect(rows).toHaveCount(1);
      await expect(rows).toContainText(bundle.staffs[0]!.name);
      await expect(guest.page.getByTestId('booking-submitted-details')).not.toContainText(
        bundle.room.name,
      );
    } finally {
      await guest.close();
      await cleanup(page, [bundle.service.serviceId], bundle.resourceIds);
    }
  });

  test('a room taken after the slot was chosen returns to availability with the bundle message and the pick kept', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const staff = await seedResource(page, 'STAFF');
    const room = await seedResource(page, 'ROOM');
    const service = await createService(page, {
      name: makeUniqueServiceName('e2e-pacote-corrida'),
      priceAmount: 150,
      durationMinutes: 60,
      loyaltyPointsValue: 10,
    });
    await setResourceRequirements(page, service.serviceId, [
      { type: 'STAFF', selectionMode: 'CUSTOMER_CHOICE', resourcePoolIds: [staff.id] },
      { type: 'ROOM', selectionMode: 'CUSTOMER_CHOICE', resourcePoolIds: [room.id] },
    ]);
    const picks: ResourceSelectionItem[] = [
      { serviceId: service.serviceId, legIndex: null, resourceType: 'STAFF', resourceId: staff.id },
      { serviceId: service.serviceId, legIndex: null, resourceType: 'ROOM', resourceId: room.id },
    ];
    const guest = await newGuestPage(browser);

    try {
      await openBooking(guest.page);
      await selectService(guest.page, service.serviceId);
      await nextButton(guest.page).click();
      await guest.page.locator(`[data-resource-id="${staff.id}"]`).click();
      await guest.page.locator(`[data-resource-id="${room.id}"]`).click();
      await nextButton(guest.page).click();
      await toConfirmation(guest.page);
      const chosen = await findFirstSlot(page, service.serviceId, picks);

      // Another customer takes the bundle's room for the slot the guest is about to submit.
      expect(
        await bookAsGuest(page, {
          serviceIds: [service.serviceId],
          scheduledAt: chosen.startsAt,
          resourceSelections: picks,
        }),
      ).toBe(201);
      await confirmBooking(guest.page);

      await expect(guest.page.getByTestId('step2-error')).toContainText(
        'Parte deste agendamento não está mais disponível.',
      );
      await expect(nextButton(guest.page)).toBeDisabled();
      await guest.page.getByRole('button', { name: 'Voltar' }).click();
      await expect(guest.page.locator(`[data-resource-id="${room.id}"] input`)).toBeChecked();
      await expect(guest.page.locator(`[data-resource-id="${staff.id}"] input`)).toBeChecked();
    } finally {
      await guest.close();
      await cleanup(page, [service.serviceId], [staff.id, room.id]);
    }
  });
});

test.describe('M23-S11b — journey', () => {
  test('the review shows every leg with its time, transition and resources; the details box shows the same times with every assigned resource named', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const journey = await seedJourney(page);
    const guest = await newGuestPage(browser);

    try {
      await openBooking(guest.page);
      await selectService(guest.page, journey.service.serviceId);
      await nextButton(guest.page).click();
      await expect(stepIndicator(guest.page, 2, 6)).toBeVisible();
      await pickJourneyChoices(guest.page, journey);
      const slotStart = await toConfirmation(guest.page);

      await expect(stepIndicator(guest.page, 6, 6)).toBeVisible();
      await expect(guest.page.getByRole('heading', { name: 'Confirme sua jornada' })).toBeVisible();
      const legs = guest.page.getByTestId('leg-item');
      await expect(legs).toHaveCount(3);
      const reviewed = await ranges(legs, 'p:first-child');
      expect(reviewed).toEqual([
        { start: slotStart, end: slotStart + 20 },
        { start: slotStart + 30, end: slotStart + 60 },
        { start: slotStart + 65, end: slotStart + 85 },
      ]);
      await expect(legs.nth(0)).toContainText('Sala atribuída automaticamente');
      await expect(legs.nth(0)).toContainText('+ 10 min de transição antes da próxima etapa');
      await expect(legs.nth(1)).toContainText(`com ${journey.staffs[0]!.name} (sua escolha)`);
      await expect(legs.nth(2)).toContainText(`com ${journey.equipments[0]!.name} (sua escolha)`);
      await expect(guest.page.getByTestId('leg-reserved')).toContainText(
        '1h 10min de serviço + 15 min de transição = 1h 25min reservados',
      );
      await expect(guest.page.getByTestId('confirmation-total')).toHaveText(
        'Total: R$ 260,00 — 1h 25min',
      );
      await confirmBooking(guest.page);

      await expect(guest.page.getByTestId('booking-success')).toBeVisible();
      const timeline = guest.page.getByTestId('itinerary-leg');
      await expect(timeline).toHaveCount(3);
      expect(await ranges(timeline, 'strong')).toEqual(reviewed);
      await expect(timeline.nth(0)).toContainText(journey.autoRoom.name);
      await expect(timeline.nth(1)).toContainText(journey.staffs[0]!.name);
      await expect(timeline.nth(1)).toContainText(journey.poolRoom.name);
      await expect(timeline.nth(2)).toContainText(journey.equipments[0]!.name);
      await expect(guest.page.getByTestId('submitted-total')).toContainText('Total: R$ 260,00');
    } finally {
      await guest.close();
      await cleanup(page, [journey.service.serviceId], journey.resourceIds);
    }
  });

  test('a leg resource taken after the slot was chosen returns to availability with the journey message and the picks kept', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const journey = await seedJourney(page, 'e2e-jornada-corrida');
    const taker = await createService(page, {
      name: makeUniqueServiceName('e2e-jornada-ocupa'),
      priceAmount: 50,
      durationMinutes: 60,
      loyaltyPointsValue: 0,
    });
    await setResourceRequirements(page, taker.serviceId, [
      { type: 'ROOM', selectionMode: 'AUTO_FUNGIBLE_POOL', resourcePoolIds: [journey.autoRoom.id] },
    ]);
    const guest = await newGuestPage(browser);

    try {
      await openBooking(guest.page);
      await selectService(guest.page, journey.service.serviceId);
      await nextButton(guest.page).click();
      await pickJourneyChoices(guest.page, journey);
      await toConfirmation(guest.page);
      const chosen = await findFirstSlot(page, journey.service.serviceId, journeyPicks(journey));

      // The Sauna room is booked by someone else for the slot the guest is about to submit.
      expect(
        await bookAsGuest(page, { serviceIds: [taker.serviceId], scheduledAt: chosen.startsAt }),
      ).toBe(201);
      await confirmBooking(guest.page);

      await expect(guest.page.getByTestId('step2-error')).toContainText(
        'Uma das etapas deste agendamento não está mais disponível.',
      );
      await expect(nextButton(guest.page)).toBeDisabled();
      await guest.page.getByRole('button', { name: 'Voltar' }).click();
      await expect(
        guest.page.locator(`[data-resource-id="${journey.equipments[0]!.id}"] input`),
      ).toBeChecked();
      await guest.page.getByRole('button', { name: 'Voltar' }).click();
      await expect(
        guest.page.locator(`[data-resource-id="${journey.staffs[0]!.id}"] input`),
      ).toBeChecked();
    } finally {
      await guest.close();
      await cleanup(page, [journey.service.serviceId, taker.serviceId], journey.resourceIds);
    }
  });

  test('the journey review and the details box have no axe violations on a light tenant or under a dark palette', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const journey = await seedJourney(page, 'e2e-jornada-axe');
    const guest = await newGuestPage(browser);

    try {
      await openBooking(guest.page);
      await selectService(guest.page, journey.service.serviceId);
      await nextButton(guest.page).click();
      await pickJourneyChoices(guest.page, journey);
      await toConfirmation(guest.page);
      await expect(guest.page.getByTestId('leg-itinerary')).toBeVisible();

      const light = await new AxeBuilder({ page: guest.page }).include('main').analyze();
      expect(light.violations).toEqual([]);
      await applyDarkHotsitePalette(guest.page);
      const dark = await new AxeBuilder({ page: guest.page }).include('main').analyze();
      expect(dark.violations).toEqual([]);

      await confirmBooking(guest.page);
      await expect(guest.page.getByTestId('booking-submitted-details')).toBeVisible();
      const success = await new AxeBuilder({ page: guest.page }).include('main').analyze();
      expect(success.violations).toEqual([]);
    } finally {
      await guest.close();
      await cleanup(page, [journey.service.serviceId], journey.resourceIds);
    }
  });
});

test.describe('M23-S11b — combined baskets', () => {
  test('a fixed service then a journey: the journey starts where the fixed line ends, and the details box carries the same times and one total', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const fixed = await seedFixedService(page);
    const journey = await seedJourney(page, 'e2e-jornada-misto');
    const guest = await newGuestPage(browser);

    try {
      await openBooking(guest.page);
      await selectService(guest.page, fixed.serviceId);
      await selectService(guest.page, journey.service.serviceId);
      await nextButton(guest.page).click();
      await pickJourneyChoices(guest.page, journey);
      const slotStart = await toConfirmation(guest.page);

      const rows = guest.page.getByTestId('basket-line');
      await expect(rows).toHaveCount(2);
      const lineRanges = await ranges(rows, 'p.text-sm.font-semibold');
      expect(lineRanges).toEqual([
        { start: slotStart, end: slotStart + 30 },
        { start: slotStart + 30, end: slotStart + 115 },
      ]);
      const legs = guest.page.getByTestId('leg-item');
      const reviewed = await ranges(legs, 'p:first-child');
      expect(reviewed[0]).toEqual({ start: slotStart + 30, end: slotStart + 50 });
      expect(reviewed[2]).toEqual({ start: slotStart + 95, end: slotStart + 115 });
      await expect(guest.page.getByTestId('confirmation-total')).toHaveText(
        'Total: R$ 340,00 — 1h 55min',
      );
      await confirmBooking(guest.page);

      await expect(guest.page.getByTestId('booking-success')).toBeVisible();
      const timeline = guest.page.getByTestId('itinerary-leg');
      expect(await ranges(timeline, 'strong')).toEqual(reviewed);
      await expect(guest.page.getByTestId('submitted-total')).toContainText(
        'Total: R$ 340,00 · 1h 55min',
      );
    } finally {
      await guest.close();
      await cleanup(page, [fixed.serviceId, journey.service.serviceId], journey.resourceIds);
    }
  });

  test('a journey then a variable-duration service: 7 steps, the quote joins the total, and the line follows the journey', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const journey = await seedJourney(page, 'e2e-jornada-tempo');
    const variable = await seedVariableDurationService(page, 'e2e-tempo-jornada');
    const guest = await newGuestPage(browser);

    try {
      await openBooking(guest.page);
      await selectService(guest.page, journey.service.serviceId);
      await selectService(guest.page, variable.service.serviceId);
      await nextButton(guest.page).click();
      await pickJourneyChoices(guest.page, journey);

      await expect(stepIndicator(guest.page, 4, 7)).toBeVisible();
      await expect(guest.page.getByTestId('duration-total')).toContainText('Total: R$ 50,00');
      await nextButton(guest.page).click();
      const slotStart = await toConfirmation(guest.page);

      await expect(stepIndicator(guest.page, 7, 7)).toBeVisible();
      const rows = guest.page.getByTestId('basket-line');
      const lineRanges = await ranges(rows, 'p.text-sm.font-semibold');
      expect(lineRanges).toEqual([
        { start: slotStart, end: slotStart + 85 },
        { start: slotStart + 85, end: slotStart + 145 },
      ]);
      await expect(guest.page.getByTestId('confirmation-total')).toHaveText(
        'Total: R$ 310,00 — 2h 25min',
      );
      await confirmBooking(guest.page);

      await expect(guest.page.getByTestId('booking-success')).toBeVisible();
      await expect(guest.page.getByTestId('submitted-total')).toContainText(
        'Total: R$ 310,00 · 2h 25min',
      );
    } finally {
      await guest.close();
      await cleanup(
        page,
        [journey.service.serviceId, variable.service.serviceId],
        [...journey.resourceIds, ...variable.resourceIds],
      );
    }
  });
});
