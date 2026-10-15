import { expect, test, type Locator, type Page } from '@playwright/test';
import { loginAsStaff } from './helpers/auth';
import { deactivateResource, getResourceRow, reactivateResource } from './helpers/booking';
import { MANAGER_EMAIL, TENANT_SLUG } from './helpers/booking-form';
import {
  findBookingCard,
  readBookedStarts,
  readBookingDetail,
  readOpenWorklistCount,
  seedWorklistEntries,
} from './helpers/scheduling-exceptions';

// M23-S14 — "Reservas a resolver". Every spec seeds bookings on its own freshly created room and
// then deactivates it (the way a manager does), which raises the entries; the shared tenant's
// other entries are ignored by finding the group through that room's unique name.

const STAFF_EMAIL = 'funcionario@lavacar.com.br';

// The sidebar badge's number (0 when it is hidden). It counts the whole tenant, which parallel specs
// also change, so a spec only asserts how it moved relative to what it did, never an exact value.
const badgeCount = async (page: Page): Promise<number> => {
  const badge = page
    .getByTestId('sidebar-nav-scheduling-exceptions')
    .getByTestId('scheduling-exceptions-badge');
  return (await badge.count()) > 0 ? Number(await badge.textContent()) : 0;
};

const groupOf = (page: Page, resourceName: string): Locator =>
  page.getByTestId('scheduling-exceptions-group').filter({ hasText: `${resourceName} ficou` });

const cardOf = (group: Locator, contactName: string): Locator =>
  group.locator('div.relative').filter({ hasText: contactName }).first();

test.describe('M23-S14 — Reservas a resolver', () => {
  test('a manager bulk-reassigns two bookings to any free resource', async ({ page }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const seed = await seedWorklistEntries(page, [{ approve: true }, { approve: true }]);
    const openBefore = await readOpenWorklistCount(page);

    try {
      await page.goto('/dashboard/scheduling-exceptions');
      const group = groupOf(page, seed.source.name);
      await expect(group).toBeVisible();
      await expect(group).toContainText('2 reservas');
      // The sidebar badge counts the open entries (a count query, not the list).
      await expect(page.getByTestId('sidebar-nav-scheduling-exceptions')).toBeVisible();
      await expect.poll(() => badgeCount(page)).toBeGreaterThanOrEqual(2);

      await group.getByRole('button', { name: 'Selecionar todos' }).click();
      const bar = page.getByTestId('scheduling-exceptions-bulk-bar');
      await expect(bar).toContainText('2 selecionadas');
      await bar.getByRole('button', { name: 'Reatribuir' }).click();

      const sheet = page.getByRole('dialog');
      await expect(sheet.getByRole('radio', { name: /Qualquer recurso livre/ })).toBeChecked();
      await sheet.getByRole('button', { name: 'Reatribuir 2 reservas' }).click();

      const result = page.getByTestId('scheduling-exceptions-result');
      await expect(result).toContainText('2 reservas resolvidas');
      await result.getByRole('button', { name: 'Voltar à lista' }).click();

      await expect(groupOf(page, seed.source.name)).toHaveCount(0);
      // This spec closed two entries, so the tenant-wide count is at least two lower (other specs
      // running in parallel may also have closed or opened some).
      await expect.poll(() => badgeCount(page)).toBeLessThanOrEqual(openBefore - 2);
      expect(await readOpenWorklistCount(page)).toBeLessThanOrEqual(openBefore - 2);

      // Same time, another resource: both bookings now occupy the alternative room at exactly
      // their original times, and they are still confirmed.
      const booked = await readBookedStarts(page, seed.alternative.id, seed.bookings[0].startsAt);
      for (const booking of seed.bookings) {
        expect(booked).toContain(new Date(booking.startsAt).getTime());
        const detail = await readBookingDetail(page, booking.bookingId);
        expect(detail.status).toBe('APPROVED');
        expect(new Date(detail.scheduledAt).getTime()).toBe(new Date(booking.startsAt).getTime());

        // The staff list (the Agenda block's resource line) shows the room the booking is on now,
        // not the deactivated one it left: the assignment audit table keeps both rows.
        const card = await findBookingCard(page, booking.bookingId, booking.startsAt);
        const rooms = (card?.assignedResources ?? [])
          .filter((r) => r.resourceType === 'ROOM')
          .map((r) => r.resourceId);
        expect(rooms).toEqual([seed.alternative.id]);
      }
    } finally {
      await seed.cleanup();
    }
  });

  test('a manager bulk-cancels bookings with a reason', async ({ page }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const seed = await seedWorklistEntries(page, [{ approve: true }, { approve: false }]);

    try {
      await page.goto('/dashboard/scheduling-exceptions');
      const group = groupOf(page, seed.source.name);
      await expect(group).toBeVisible();

      // Only a confirmed booking can be rescheduled: the pending one has no Reagendar.
      const [confirmed, pending] = seed.bookings;
      await expect(
        cardOf(group, confirmed.contactName).getByRole('link', { name: 'Reagendar' }),
      ).toBeVisible();
      if (pending.status !== 'APPROVED') {
        await expect(
          cardOf(group, pending.contactName).getByRole('link', { name: 'Reagendar' }),
        ).toHaveCount(0);
      }

      await group.getByRole('button', { name: 'Selecionar todos' }).click();
      await page
        .getByTestId('scheduling-exceptions-bulk-bar')
        .getByRole('button', { name: 'Cancelar' })
        .click();
      const sheet = page.getByRole('dialog', { name: 'Cancelar 2 reservas?' });
      await sheet.getByRole('textbox').fill('Sala fechada definitivamente');
      await sheet.getByRole('button', { name: 'Cancelar 2 reservas' }).click();

      const result = page.getByTestId('scheduling-exceptions-result');
      await expect(result).toContainText('2 reservas resolvidas');
      await result.getByRole('button', { name: 'Voltar à lista' }).click();
      await expect(groupOf(page, seed.source.name)).toHaveCount(0);

      for (const booking of seed.bookings) {
        expect((await readBookingDetail(page, booking.bookingId)).status).toBe('CANCELLED');
      }
    } finally {
      await seed.cleanup();
    }
  });

  test('a manager reschedules one confirmed booking on its own route', async ({ page }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    // AUTO_ANY: a booking whose customer chose the deactivated room cannot be re-resolved on a
    // reschedule (it stays open), so this one lets the system pick the room.
    const seed = await seedWorklistEntries(page, [{ approve: true }], { selection: 'AUTO_ANY' });
    const [confirmed] = seed.bookings;

    try {
      await page.goto('/dashboard/scheduling-exceptions');
      const group = groupOf(page, seed.source.name);
      await expect(group).toBeVisible();

      expect(confirmed.status).toBe('APPROVED');
      await expect(
        cardOf(group, confirmed.contactName).getByRole('link', { name: 'Reagendar' }),
      ).toBeVisible();

      await cardOf(group, confirmed.contactName).getByRole('link', { name: 'Reagendar' }).click();
      await expect(page).toHaveURL(/\/dashboard\/scheduling-exceptions\/[^/]+\/reschedule$/);
      // The staff reschedule page itself: the day strip and the slot grid.
      await page.locator('[data-testid="day-option"]:not([disabled])').last().click();
      await page.locator('[data-testid="time-slot"]').first().click();
      await page.getByRole('button', { name: 'Reagendar' }).first().click();

      // Back on the list, and the booking moved: the entry is closed, the booking has a new time.
      await expect(page).toHaveURL(/\/dashboard\/scheduling-exceptions$/);
      const after = await readBookingDetail(page, confirmed.bookingId);
      expect(after.status).toBe('APPROVED');
      expect(new Date(after.scheduledAt).toISOString()).not.toBe(
        new Date(confirmed.startsAt).toISOString(),
      );
      await expect(cardOf(groupOf(page, seed.source.name), confirmed.contactName)).toHaveCount(0);
    } finally {
      await seed.cleanup();
    }
  });

  test('the card opens the booking detail and back returns to the worklist', async ({ page }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const seed = await seedWorklistEntries(page, [{ approve: true }]);
    const [booking] = seed.bookings;

    try {
      await page.goto('/dashboard/scheduling-exceptions');
      const group = groupOf(page, seed.source.name);
      await group.getByRole('link', { name: /Ver detalhes do agendamento/ }).click();

      const returnTo = encodeURIComponent('/dashboard/scheduling-exceptions');
      await expect(page).toHaveURL(`/dashboard/bookings/${booking.bookingId}?returnTo=${returnTo}`);

      // The back arrow returns to the worklist, not to the booking queue.
      await page.getByTestId('topbar-back-button').click();
      await expect(page).toHaveURL('/dashboard/scheduling-exceptions');
    } finally {
      await seed.cleanup();
    }
  });

  test('a resource deactivated from the Resources screen shows in the worklist without a reload', async ({
    page,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    // The room stays active here: this spec deactivates it through the UI, like a manager.
    const seed = await seedWorklistEntries(page, [{ approve: true }], { deactivateSource: false });

    try {
      // Open the worklist first so its (empty for this room) result is what the cache holds.
      await page.goto('/dashboard/scheduling-exceptions');
      await expect(groupOf(page, seed.source.name)).toHaveCount(0);

      // Client-side navigation only from here on: a full reload would hide a stale cache.
      await page.getByTestId('sidebar-nav-resources').click();
      await getResourceRow(page, seed.source.name)
        .getByTestId('resource-row-deactivate-link')
        .click();
      await page.getByTestId('resource-deactivate-confirm-desktop').click();
      await expect(page).toHaveURL('/dashboard/resources');

      await page.getByTestId('sidebar-nav-scheduling-exceptions').click();
      await expect(groupOf(page, seed.source.name)).toBeVisible();
      await expect.poll(() => badgeCount(page)).toBeGreaterThanOrEqual(1);
    } finally {
      await seed.cleanup();
    }
  });

  test('reactivating the resource clears its entries and the badge without a reload', async ({
    page,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    // The seed deactivates the source room, which raises the entries.
    const seed = await seedWorklistEntries(page, [{ approve: true }]);

    try {
      await page.goto('/dashboard/scheduling-exceptions');
      await expect(groupOf(page, seed.source.name)).toBeVisible();
      await expect.poll(() => badgeCount(page)).toBeGreaterThanOrEqual(1);
      const badgeBefore = await badgeCount(page);

      // Client-side navigation only: a full reload would hide a stale cache.
      await page.getByTestId('sidebar-nav-resources').click();
      await getResourceRow(page, seed.source.name)
        .getByTestId('resource-row-reactivate-button')
        .click();
      await expect(getResourceRow(page, seed.source.name)).toContainText('Ativo');

      await page.getByTestId('sidebar-nav-scheduling-exceptions').click();
      await expect(groupOf(page, seed.source.name)).toHaveCount(0);
      // Closing this room's entries lowers the tenant-wide badge by at least one (parallel specs
      // may also have changed it, so only the bound is asserted).
      await expect.poll(() => badgeCount(page)).toBeLessThanOrEqual(badgeBefore - 1);
    } finally {
      await seed.cleanup();
    }
  });

  test('the alternatives follow the real data: none, then a reactivated room, then none again', async ({
    page,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    // The alternative room is already inactive when the entries are raised: nothing to offer.
    const seed = await seedWorklistEntries(page, [{ approve: true }], { alternativeActive: false });
    const [booking] = seed.bookings;

    try {
      await page.goto('/dashboard/scheduling-exceptions');
      const card = cardOf(groupOf(page, seed.source.name), booking.contactName);
      await expect(card).toContainText('Sem alternativa compatível');
      await expect(card.getByRole('button', { name: 'Reatribuir' })).toBeDisabled();

      // Reactivating the room makes it an alternative on the next read (not frozen at raise time).
      await reactivateResource(page, seed.alternative.id);
      await page.reload();
      await expect(card).toContainText(seed.alternative.name);
      await expect(card.getByRole('button', { name: 'Reatribuir' })).toBeEnabled();

      // And a second deactivation in a row takes it away again.
      await deactivateResource(page, seed.alternative.id);
      await page.reload();
      await expect(card).toContainText('Sem alternativa compatível');
      await expect(card.getByRole('button', { name: 'Reatribuir' })).toBeDisabled();
    } finally {
      await seed.cleanup();
    }
  });

  test('a STAFF user has no sidebar item and is turned away from the page', async ({ page }) => {
    await loginAsStaff(page, STAFF_EMAIL, TENANT_SLUG);

    await page.goto('/dashboard/bookings');
    // The dashboard did load for this STAFF user (the Agenda link is there)…
    await expect(page.getByRole('link', { name: 'Agenda' }).first()).toBeVisible();
    // …but "Reservas a resolver" is manager-only.
    await expect(page.getByTestId('sidebar-nav-scheduling-exceptions')).toHaveCount(0);

    await page.goto('/dashboard/scheduling-exceptions');
    await expect(page).not.toHaveURL(/scheduling-exceptions/);
  });

  test('shows the empty state when nothing is open', async ({ page }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    // The shared tenant keeps entries other specs left open, so the empty answer is stubbed at the
    // network; the page, the route and the empty-state copy are the real ones.
    await page.route('**/scheduling-exceptions?status=OPEN', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"items":[]}' }),
    );

    await page.goto('/dashboard/scheduling-exceptions');

    const empty = page.getByTestId('scheduling-exceptions-empty');
    await expect(empty).toContainText('Nenhuma reserva a resolver');
    await expect(empty.getByRole('link', { name: 'Ver recursos' })).toHaveAttribute(
      'href',
      '/dashboard/resources',
    );
  });
});
