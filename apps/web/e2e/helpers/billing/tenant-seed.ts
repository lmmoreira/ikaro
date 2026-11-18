import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { linkStaffGoogleAccount, loginAsCustomer, loginAsStaff, uniqueTestEmail } from '../auth';
import { BFF_URL, WEB_INTERNAL_KEY } from '../auth/shared';
import { createAuthenticatedBooking } from '../booking';
import { completeCustomerProfile } from '../customer';
import { applyTemplateFixture } from '../hotsite/template-fixtures';
import { createService, makeUniqueServiceName } from '../services';
import { inviteStaff } from '../staff';
import type { ProvisionedTenant } from './provisioning';

// What a provisioned tenant needs before a customer can have bookings: a service and a manager
// session. Every function takes the tenant explicitly: the booking helpers the rest of the suite
// uses are bound to the seeded `lavacar-beloauto` tenant.

const actorContexts: BrowserContext[] = [];

// A separate browser context per actor, so a manager, a staff member and a customer are signed in
// at once (each `loginAs*` writes the page's own cookie jar). A context made with
// `browser.newContext()` outlives its test, and the worker's browser is shared by every test of the
// run, so each is recorded here and `closeActorPages` (called from `afterEach`) closes it.
export async function newActorPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  actorContexts.push(context);
  return context.newPage();
}

export async function closeActorPages(): Promise<void> {
  const open = actorContexts.splice(0);
  await Promise.all(open.map((context) => context.close()));
}

export async function signInManager(page: Page, tenant: ProvisionedTenant): Promise<void> {
  await loginAsStaff(page, tenant.adminEmail, tenant.slug);
}

export async function seedService(page: Page): Promise<string> {
  const service = await createService(page, {
    name: makeUniqueServiceName('e2e-billing'),
    priceAmount: 50,
    durationMinutes: 60,
    loyaltyPointsValue: 10,
  });
  return service.serviceId;
}

export interface SeededBooking {
  readonly bookingId: string;
  readonly customerEmail: string;
}

// The customer books on `customerPage`, then the tenant's manager acts on `managerPage`. `daysAhead`
// differs per booking so two bookings of one customer never compete for the same slot.
export async function seedBooking(
  customerPage: Page,
  managerPage: Page,
  tenant: ProvisionedTenant,
  options: {
    readonly serviceId: string;
    readonly customerEmail: string;
    readonly daysAhead: number;
    readonly then: 'approve' | 'request-info' | 'leave-pending';
  },
): Promise<SeededBooking> {
  const setup = await createAuthenticatedBooking(customerPage, {
    tenantSlug: tenant.slug,
    emailPrefix: 'billing',
    daysAhead: options.daysAhead,
    serviceIds: [options.serviceId],
    contactEmail: options.customerEmail,
  });
  if (options.then === 'approve') {
    await managerCall(managerPage, 'approve', setup.bookingId, {});
  } else if (options.then === 'request-info') {
    await managerCall(managerPage, 'request-info', setup.bookingId, {
      message: 'Precisamos de mais informações para confirmar.',
    });
  }
  return { bookingId: setup.bookingId, customerEmail: options.customerEmail };
}

async function managerCall(
  managerPage: Page,
  action: 'approve' | 'request-info',
  bookingId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const res = await managerPage.request.patch(`${BFF_URL}/bookings/${bookingId}/${action}`, {
    data,
    headers: { 'X-Web-Internal-Key': WEB_INTERNAL_KEY! },
  });
  if (!res.ok()) throw new Error(`${action} failed: ${res.status()} ${await res.text()}`);
}

// Completes an approved booking through the staff UI (the same page `createFreshCompletedBooking`
// drives), which credits loyalty points once the loyalty handler consumes `BookingCompleted`.
export async function completeBooking(managerPage: Page, bookingId: string): Promise<void> {
  await managerPage.goto(`/dashboard/bookings/${bookingId}/complete`);
  const completed = managerPage.waitForResponse(
    (response) =>
      response.url().endsWith(`/bookings/${bookingId}/complete`) &&
      response.request().method() === 'PATCH',
  );
  await managerPage.getByTestId('action-pane-desktop').getByTestId('mark-complete-submit').click();
  expect((await completed).ok()).toBe(true);
}

// A customer who belongs to both tenants (one `Customer` row per tenant, same email), so the tenant
// switch list shows two entries. Each sign-in overwrites the page's cookie, so the LAST tenant
// listed is the one the page ends up signed in to.
export async function joinTenants(
  page: Page,
  email: string,
  tenantSlugs: readonly string[],
): Promise<void> {
  for (const slug of tenantSlugs) {
    await loginAsCustomer(page, email, slug);
    await completeCustomerProfile(page, slug);
  }
}

// A staff member of both tenants (the same Google account linked in each), so the staff picker lists
// two establishments. `first` and `second` are the tenants' own managers' pages.
export async function seedStaffOfBothTenants(
  firstManager: Page,
  first: ProvisionedTenant,
  secondManager: Page,
  second: ProvisionedTenant,
): Promise<string> {
  const email = uniqueTestEmail('billing-staff');
  for (const [manager, tenant] of [
    [firstManager, first],
    [secondManager, second],
  ] as const) {
    await inviteStaff(manager, {
      email,
      firstName: 'Equipe',
      lastName: 'E2E',
      role: 'STAFF',
    });
    await linkStaffGoogleAccount(email, tenant.slug);
  }
  return email;
}

// Publishes a catalogue template on the tenant's hotsite with EVERY module enabled, whatever the
// plan: a fresh hotsite has no modules (publishing it is refused), and the manager's stored choice
// must survive a plan without the feature (the manifest, not the stored layout, leaves the section
// out). Disabling the gated modules here would also be refused: the template's navigation targets
// them.
export async function publishHotsiteWithEveryModule(managerPage: Page): Promise<void> {
  await applyTemplateFixture(managerPage, 'beloauto', (fixture) => ({
    ...fixture,
    layout: fixture.layout.map((module) => ({ ...module, enabled: true })),
  }));
}

// Points are credited by the loyalty handler when it consumes `BookingCompleted`, not by the
// completion request, and the loyalty page sends a customer with no balance yet back to Início. A
// scenario that suspends the tenant afterwards waits here, while it is still operational, so the
// suspended page always has a balance to read.
export async function waitForLoyaltyEntry(customerPage: Page, slug: string): Promise<void> {
  await expect
    .poll(
      async () => {
        await customerPage.goto(`/${slug}/my-account/loyalty`);
        return customerPage.getByTestId('loyalty-entry-row').count();
      },
      { timeout: 30_000, message: 'the loyalty entry of the completed booking' },
    )
    .toBeGreaterThan(0);
}
