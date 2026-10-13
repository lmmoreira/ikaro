import { expect, type Locator, type Page } from '@playwright/test';
import { completeCustomerProfile } from '../customer';
import { loginAsCustomer, uniqueTestEmail } from '../auth';
import { openFirstDayWithSlots } from '../booking-form/flow';
import { createService, makeUniqueServiceName } from '../services';

// M23-S40 (UC-108) — the staff "+ Novo → Agendamento" flow, driven through the real UI. Each step
// has two copies of its action rail in the DOM (desktop aside and mobile bar, one hidden by CSS),
// so the locators below only match the visible one.

export const STAFF_TENANT_SLUG = 'lavacar-beloauto';
export const STAFF_EMAIL = 'funcionario@lavacar.com.br';

export function staffStepNext(page: Page): Locator {
  return page.getByTestId('step-next').filter({ visible: true });
}

export function staffStepBack(page: Page): Locator {
  return page.getByTestId('step-back').filter({ visible: true });
}

// A brand-new customer of the tenant — with a phone (the booking needs one) unless asked not to —
// then the page is logged back in as the staff member who will book for them. Returns the e-mail,
// which is unique and therefore what the chooser searches for.
export async function seedCustomerForStaffBooking(
  page: Page,
  options: { readonly withPhone?: boolean } = {},
): Promise<string> {
  const email = uniqueTestEmail('staff-new-booking');
  await loginAsCustomer(page, email, STAFF_TENANT_SLUG);
  if (options.withPhone ?? true) await completeCustomerProfile(page, STAFF_TENANT_SLUG);
  return email;
}

export async function seedPlainService(page: Page): Promise<{ serviceId: string; name: string }> {
  const service = await createService(page, {
    name: makeUniqueServiceName('e2e-staff-novo'),
    description: 'Serviço de teste M23-S40',
    priceAmount: 90,
    durationMinutes: 30,
    loyaltyPointsValue: 5,
    requiresPickupAddress: false,
    isActive: true,
  });
  return { serviceId: service.serviceId, name: service.name };
}

export async function openNewBookingMenu(page: Page): Promise<void> {
  await page.goto('/dashboard/bookings');
  await page.getByTestId('new-menu-trigger').click();
  await expect(page.getByTestId('new-menu')).toBeVisible();
}

export async function startNewBooking(page: Page): Promise<void> {
  await openNewBookingMenu(page);
  await page.getByTestId('new-menu-item').click();
  await expect(page.getByTestId('customer-chooser')).toBeVisible();
}

export async function chooseRegisteredCustomer(page: Page, email: string): Promise<void> {
  await page.getByTestId('customer-search').fill(email);
  const row = page.getByTestId('customer-row').filter({ hasText: email });
  await expect(row).toHaveCount(1);
  await row.click();
  await page.getByTestId('chooser-continue').filter({ visible: true }).click();
  await expect(page.getByTestId('recipient-header')).toBeVisible();
}

export async function chooseNewContact(
  page: Page,
  contact: { readonly name: string; readonly phone: string; readonly email: string },
): Promise<void> {
  await page.getByTestId('chooser-tab').filter({ hasText: 'Novo contato' }).click();
  await page.getByTestId('guest-name').fill(contact.name);
  await page.getByTestId('guest-phone').fill(contact.phone);
  await page.getByTestId('guest-email').fill(contact.email);
  await page.getByTestId('chooser-continue').filter({ visible: true }).click();
  await expect(page.getByTestId('recipient-header')).toBeVisible();
}

export async function chooseServiceInSteps(page: Page, serviceId: string): Promise<void> {
  await page
    .locator(`[data-testid="service-card"][data-service-id="${serviceId}"]`)
    .getByRole('checkbox')
    .check();
  await staffStepNext(page).click();
}

const MAX_SLOT_ATTEMPTS = 6;

// Chooses the first free slot and creates the booking. A slot that another test took between the
// availability read and the submit comes back as the date step with a banner (`step2-error`); the
// next slot is then tried — the shared tenant makes this race possible, never likely.
export async function createStaffBookingOnFirstFreeSlot(page: Page): Promise<void> {
  await openFirstDayWithSlots(page);
  for (let attempt = 0; attempt < MAX_SLOT_ATTEMPTS; attempt += 1) {
    await page.getByTestId('time-slot').nth(attempt).click();
    await staffStepNext(page).click();
    await expect(page.getByTestId('step-confirmation')).toBeVisible();
    await staffStepNext(page).click();

    const created = page.getByTestId('outcome-banner-title');
    const conflict = page.getByTestId('step2-error');
    await expect(created.or(conflict)).toBeVisible();
    if (await created.isVisible()) return;
    await expect(page.getByTestId('time-slot').nth(attempt + 1)).toBeVisible();
  }
  throw new Error(`no free slot after ${MAX_SLOT_ATTEMPTS} attempts`);
}
