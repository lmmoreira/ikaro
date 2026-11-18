import { expect, test } from '@playwright/test';
import { loginAsCustomer, loginAsStaff, uniqueTestEmail } from './helpers/auth';
import {
  accountPath,
  closeActorPages,
  completeBooking,
  expectAccess,
  expectClientSessionKept,
  expectPageNewMenu,
  expectTabInBothNavs,
  joinTenants,
  markClientSession,
  newActorPage,
  operatorSuspend,
  operatorUnsuspend,
  provisionTenant,
  REINSTATEMENT_BOUND_MS,
  seedBooking,
  seedService,
  seedStaffOfBothTenants,
  signInManager,
  visibleByTestId,
  waitForLoyaltyEntry,
} from './helpers/billing';
import { completeCustomerProfile } from './helpers/customer';
import { getTenantSettings } from './helpers/platform/settings-api';

// UC-121: the suspended tenant, from every actor, in a real browser against the real BFF, backend
// and routing (what jsdom specs cannot exercise). The tenant is provisioned by the spec itself and
// suspended through the operator route: a seeded tenant is shared by dozens of specs. The second
// tenant stays operational throughout.
//
// This is one spanning scenario and not one test per actor because every actor needs the same
// tenant, bookings and suspension, and a suspension in the middle of a session is the point.

const SUSPENSION_POLL_MS = REINSTATEMENT_BOUND_MS;
const account = accountPath;

// The tenant is suspended in the middle of the scenario, so a failure there would leave it
// suspended in a compose database that later runs reuse. Unsuspending is a no-op `200` on a tenant
// that is not suspended, so the cleanup is safe on every path.
let tenantToRestore: string | undefined;

test.afterEach(async () => {
  try {
    if (tenantToRestore !== undefined) await operatorUnsuspend(tenantToRestore);
  } finally {
    tenantToRestore = undefined;
    await closeActorPages();
  }
});

test.describe('billing: the suspended tenant', () => {
  test('manager, staff and customer each meet the suspended surface and the tenant is restored', async ({
    browser,
  }) => {
    test.setTimeout(240_000);

    // ── Setup: two trial tenants, their managers, a service and the customer's bookings ──
    const tenant = await provisionTenant({ exempt: false, prefix: 'e2e-susp' });
    const other = await provisionTenant({ exempt: false, prefix: 'e2e-oper' });
    const slug = tenant.slug;
    tenantToRestore = tenant.tenantId;

    const managerPage = await newActorPage(browser);
    const otherManagerPage = await newActorPage(browser);
    await signInManager(managerPage, tenant);
    await signInManager(otherManagerPage, other);
    const serviceId = await seedService(managerPage);
    const staffEmail = await seedStaffOfBothTenants(managerPage, tenant, otherManagerPage, other);
    const settingsBefore = await getTenantSettings(managerPage);

    const customerPage = await newActorPage(browser);
    const customerEmail = uniqueTestEmail('billing-customer');
    await joinTenants(customerPage, customerEmail, [other.slug, tenant.slug]);
    const cancellable = await seedBooking(customerPage, managerPage, tenant, {
      serviceId,
      customerEmail,
      daysAhead: 18,
      then: 'approve',
    });
    const detail = await seedBooking(customerPage, managerPage, tenant, {
      serviceId,
      customerEmail,
      daysAhead: 19,
      then: 'approve',
    });
    // An INFO_REQUESTED row is the only one that offers "Responder"; its absence is asserted below.
    await seedBooking(customerPage, managerPage, tenant, {
      serviceId,
      customerEmail,
      daysAhead: 20,
      then: 'request-info',
    });
    const completed = await seedBooking(customerPage, managerPage, tenant, {
      serviceId,
      customerEmail,
      daysAhead: 21,
      then: 'approve',
    });
    await completeBooking(managerPage, completed.bookingId);
    await loginAsCustomer(customerPage, customerEmail, slug);
    await waitForLoyaltyEntry(customerPage, slug);

    // A customer with no booking at all: a suspended tenant refuses the profile edit that a first
    // sign-in needs, so the account is completed before the suspension.
    const newcomer = await newActorPage(browser);
    const newcomerEmail = uniqueTestEmail('billing-empty');
    await loginAsCustomer(newcomer, newcomerEmail, slug);
    await completeCustomerProfile(newcomer, slug);

    const bookingsHref = `${account(slug)}/bookings`;
    const loyaltyHref = `${account(slug)}/loyalty`;

    // ── The customer, in the middle of a session: the operator suspends, the customer only
    //    navigates on the client and every page shows its suspended state on arrival ──
    await test.step('suspension in the middle of a session, seen through client navigation', async () => {
      await customerPage.goto(account(slug));
      await expect(customerPage.locator(`a[href="${bookingsHref}"]:visible`).first()).toBeVisible();
      await expect(visibleByTestId(customerPage, 'new-menu-trigger')).toBeVisible();
      await markClientSession(customerPage);

      await operatorSuspend(tenant.tenantId);
      await expectAccess(tenant.tenantId, { operational: false });

      await customerPage.locator(`a[href="${loyaltyHref}"]:visible`).first().click();
      await expect(customerPage.getByTestId('loyalty-inactive-notice')).toBeVisible({
        timeout: SUSPENSION_POLL_MS,
      });
      await expectClientSessionKept(customerPage);

      await customerPage.locator(`a[href="${bookingsHref}"]:visible`).first().click();
      await expect(customerPage.getByTestId('inactive-tenant-notice')).toBeVisible({
        timeout: SUSPENSION_POLL_MS,
      });
      await expectPageNewMenu(customerPage, 'disabled');
      await expect(customerPage.getByTestId('booking-inactive-badge').first()).toBeVisible();
      await expect(customerPage.getByTestId('booking-respond-link')).toHaveCount(0);
      await expectClientSessionKept(customerPage);

      await customerPage.locator(`a[href="${bookingsHref}/${detail.bookingId}"]`).first().click();
      await expect(customerPage.getByTestId('booking-inactive-notice')).toBeVisible({
        timeout: SUSPENSION_POLL_MS,
      });
      await expect(customerPage.locator('a[href$="/reschedule"]')).toHaveCount(0);
      await expect(customerPage.getByTestId('info-response-textarea')).toHaveCount(0);
      await expect(customerPage.locator(`main a[href="/${slug}/booking"]`)).toHaveCount(0);
      await expectClientSessionKept(customerPage);
    });

    // ── The manager ──
    await test.step('manager: every protected route lands on the notice, never a denied read', async () => {
      for (const path of ['/dashboard/schedule', '/dashboard/settings']) {
        await managerPage.goto(path);
        await expect(managerPage).toHaveURL('/dashboard/suspended');
        await expect(managerPage.getByTestId('manager-suspended-notice')).toBeVisible();
        await expect(managerPage.getByTestId('manager-suspended-notice')).not.toContainText(
          'Fale com o gerente',
        );
      }
      await managerPage.getByTestId('manager-suspended-sign-out').click();
      // Signing out never blocks signing in again: the manager returns to the same notice.
      await signInManager(managerPage, tenant);
      await managerPage.goto('/dashboard/schedule');
      await expect(managerPage).toHaveURL('/dashboard/suspended');
    });

    // ── Staff, who also belongs to the operational tenant ──
    await test.step('staff: the staff notice from a deep URL, and the picker marks only the suspended tenant', async () => {
      const staffPage = await newActorPage(browser);
      await loginAsStaff(staffPage, staffEmail, slug);
      await staffPage.goto('/dashboard/settings');
      await expect(staffPage).toHaveURL('/dashboard/suspended');
      await expect(staffPage.getByTestId('staff-suspended-notice')).toContainText(
        'Fale com o gerente',
      );

      await staffPage.goto('/select-staff-tenant');
      await expect(staffPage.getByTestId('staff-tenant-option')).toHaveCount(2);
      await expect(staffPage.getByTestId('staff-tenant-suspended-badge')).toHaveCount(1);
      await staffPage
        .getByTestId('staff-tenant-option')
        .filter({ has: staffPage.getByTestId('staff-tenant-suspended-badge') })
        .click();
      await expect(staffPage).toHaveURL('/dashboard/suspended');
    });

    // ── The customer's account, suspended ──
    await test.step('customer: tabs, list, detail, cancel and the paths that would change a booking', async () => {
      await customerPage.goto(account(slug));
      await expectTabInBothNavs(customerPage, bookingsHref);
      await expectTabInBothNavs(customerPage, loyaltyHref);
      await expect(visibleByTestId(customerPage, 'new-booking-disabled')).toBeVisible();

      // The list keeps its three sections; every open row carries the badge and offers no
      // "Responder"; a history row is listed and opens.
      await customerPage.goto(bookingsHref);
      for (const section of ['section-upcoming', 'section-pending', 'section-history']) {
        await expect(customerPage.getByTestId(section), section).toBeVisible();
      }
      const openRows = customerPage.locator(
        '[data-testid="section-upcoming"] li, [data-testid="section-pending"] li',
      );
      await expect(openRows).toHaveCount(3);
      await expect(
        customerPage.locator(
          '[data-testid="section-upcoming"] [data-testid="booking-inactive-badge"], [data-testid="section-pending"] [data-testid="booking-inactive-badge"]',
        ),
      ).toHaveCount(3);
      await expect(customerPage.getByTestId('booking-respond-link')).toHaveCount(0);
      await customerPage
        .locator(`a[href="${bookingsHref}/${completed.bookingId}"]`)
        .first()
        .click();
      await expect(customerPage).toHaveURL(`${bookingsHref}/${completed.bookingId}`);

      // "Cancelar" on a row reaches the normal cancel page.
      await customerPage.goto(bookingsHref);
      await customerPage.locator(`a[href$="/${detail.bookingId}/cancel"]`).first().click();
      await expect(customerPage).toHaveURL(`${bookingsHref}/${detail.bookingId}/cancel`);

      // Cancelling a future booking works exactly as for an operational tenant.
      await customerPage.goto(`${bookingsHref}/${cancellable.bookingId}`);
      await customerPage
        .getByTestId('action-pane-desktop')
        .getByTestId('booking-cancel-link')
        .click();
      await visibleByTestId(customerPage, 'booking-cancel-confirm').click();
      await expect(customerPage).toHaveURL(account(slug));
      await customerPage.goto(`${bookingsHref}/${cancellable.bookingId}`);
      await expect(customerPage.getByTestId('topbar-booking-status-badge')).toContainText(
        'Cancelado',
      );

      // Every path that would create or change a booking ends on a readable page.
      for (const typed of [
        `${account(slug)}/recurring-schedules/new`,
        `${account(slug)}/recurring-schedules`,
        `${account(slug)}/alerts`,
      ]) {
        await customerPage.goto(typed);
        await expect(customerPage).toHaveURL(bookingsHref);
      }
      await customerPage.goto(`${bookingsHref}/${detail.bookingId}/reschedule`);
      await expect(customerPage).toHaveURL(`${bookingsHref}/${detail.bookingId}`);
      await expect(customerPage.getByTestId('booking-inactive-notice')).toBeVisible();

      await customerPage.goto(`/${slug}/booking`);
      await expect(customerPage.getByTestId('hotsite-unavailable')).toBeVisible();
    });

    await test.step('customer: Início previews, an empty account and the loyalty page', async () => {
      await customerPage.goto(account(slug));
      await expect(customerPage.getByTestId('booking-inactive-badge').first()).toBeVisible();

      await loginAsCustomer(newcomer, newcomerEmail, slug);
      await newcomer.goto(account(slug));
      await expect(visibleByTestId(newcomer, 'new-booking-disabled')).toBeVisible();
      await expect(newcomer.locator(`main a[href="/${slug}/booking"]`)).toHaveCount(0);

      await customerPage.goto(loyaltyHref);
      await expect(customerPage.getByTestId('loyalty-inactive-notice')).toBeVisible();
      await expect(customerPage.getByTestId('loyalty-balance-points')).toBeVisible();
      await expect(customerPage.getByTestId('loyalty-entry-row').first()).toBeVisible();
    });

    await test.step('customer of two tenants: the suspended one is marked in the switch list and can still be entered', async () => {
      await loginAsCustomer(customerPage, customerEmail, other.slug);
      await customerPage.goto('/switch-tenant');
      await expect(customerPage.getByTestId('switch-tenant-current')).not.toContainText(
        'Empresa inativa',
      );
      const option = customerPage.getByTestId('switch-tenant-option');
      await expect(option).toHaveCount(1);
      await expect(option.getByTestId('switch-tenant-inactive-badge')).toBeVisible();
      await option.click();
      // A switch lands on the tenant's hotsite (neutral page while suspended); the new session is
      // the suspended tenant's, so its account opens without a login.
      await expect(customerPage).toHaveURL(`/${slug}`);
      await customerPage.goto(account(slug));
      await expect(customerPage).toHaveURL(account(slug));
      await expect(customerPage.getByTestId('topbar-user-name')).toBeVisible();
    });

    // ── The hotsite, and the tenant that stays operational ──
    await test.step('hotsite: the neutral page with working login links; the other tenant is untouched', async () => {
      const guest = await newActorPage(browser);
      await guest.goto(`/${slug}`);
      await expect(guest.getByTestId('hotsite-unavailable')).toBeVisible();
      await expect(guest.getByTestId('hotsite-login-link').first()).toBeVisible();

      await expectAccess(other.tenantId, { operational: true });
      // The other tenant never published a hotsite (its public page reads "unavailable" for that
      // reason, not for billing), so its state is shown through its manager and its customer.
      await otherManagerPage.goto('/dashboard/schedule');
      await expect(otherManagerPage).not.toHaveURL('/dashboard/suspended');
      await loginAsCustomer(customerPage, customerEmail, other.slug);
      await customerPage.goto(`${account(other.slug)}/bookings`);
      await expect(customerPage.getByTestId('inactive-tenant-notice')).toHaveCount(0);
      await expect(visibleByTestId(customerPage, 'new-menu-trigger')).toBeVisible();
    });

    // ── Reactivation in the middle of a session, on the customer's open booking detail ──
    await test.step('reactivation in the middle of a session, seen through client navigation', async () => {
      await loginAsCustomer(customerPage, customerEmail, slug);
      await customerPage.goto(`${bookingsHref}/${detail.bookingId}`);
      await expect(customerPage.getByTestId('booking-inactive-notice')).toBeVisible();
      await markClientSession(customerPage);

      await operatorUnsuspend(tenant.tenantId);
      await expectAccess(tenant.tenantId, { operational: true });

      await customerPage.getByTestId('topbar-back-link').click();
      await expectPageNewMenu(customerPage, 'enabled');
      await expect(customerPage.getByTestId('inactive-tenant-notice')).toHaveCount(0);
      // The row that offers "Responder" offers it again (and proves the locator above is real).
      await expect(customerPage.getByTestId('booking-respond-link')).toBeVisible();
      await expectClientSessionKept(customerPage);

      await customerPage.locator(`a[href="${bookingsHref}/${detail.bookingId}"]`).first().click();
      await expect(customerPage.locator('a[href$="/reschedule"]').first()).toBeVisible({
        timeout: SUSPENSION_POLL_MS,
      });
      await expect(customerPage.getByTestId('booking-inactive-notice')).toHaveCount(0);
      await expectClientSessionKept(customerPage);
    });

    // ── Restore ──
    await test.step('restore: the manager is back in the dashboard and the preferences are untouched', async () => {
      await managerPage.goto('/dashboard/schedule');
      await expect(managerPage).not.toHaveURL('/dashboard/suspended');
      expect(await getTenantSettings(managerPage)).toEqual(settingsBefore);
    });
  });
});
