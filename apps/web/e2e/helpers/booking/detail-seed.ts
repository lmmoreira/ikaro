import type { Browser, Page } from '@playwright/test';
import type { ResourceSelectionItem } from '@ikaro/types';
import { BFF_URL, WEB_INTERNAL_KEY } from '../auth/shared';
import { loginAsCustomer } from '../auth/customer-login';
import { uniqueTestEmail } from '../auth';
import { completeCustomerProfile } from '../customer';
import { seedResource } from '../booking-form/flow';
import {
  createService,
  makeUniqueServiceName,
  publishIntakeSchema,
  setResourceRequirements,
} from '../services';

// Seeds for the full booking detail (M23-S47): a booking with a chosen room, an automatically
// assigned professional, named participants and an intake form, made by a real customer so the
// customer's own view of it can be opened too.

export const INTAKE_QUESTIONS = [
  { fieldKey: 'level', label: 'Nível de experiência', type: 'FREE_TEXT', required: true },
  { fieldKey: 'injury', label: 'Tem restrição física?', type: 'BOOLEAN', required: true },
] as const;

export interface SeededBundleWithIntake {
  readonly serviceId: string;
  readonly room: { readonly id: string; readonly name: string };
  readonly staff: { readonly id: string; readonly name: string };
}

// A ROOM the customer chooses plus a STAFF member the system assigns, with an intake form that
// asks for a participant count and named attendees. Needs a MANAGER session on `page`.
export async function seedBundleWithIntake(page: Page): Promise<SeededBundleWithIntake> {
  const room = await seedResource(page, 'ROOM');
  const staff = await seedResource(page, 'STAFF');
  const service = await createService(page, {
    name: makeUniqueServiceName('e2e-detalhe'),
    description: 'Serviço de teste M23-S47',
    priceAmount: 150,
    durationMinutes: 60,
    loyaltyPointsValue: 10,
    requiresPickupAddress: false,
    isActive: true,
  });
  await setResourceRequirements(page, service.serviceId, [
    { type: 'ROOM', selectionMode: 'CUSTOMER_CHOICE', resourcePoolIds: [room.id] },
    { type: 'STAFF', selectionMode: 'AUTO_ANY', resourcePoolIds: [staff.id] },
  ]);
  await publishIntakeSchema(page, service.serviceId, {
    questions: [...INTAKE_QUESTIONS],
    consentText: 'Li e aceito os termos.',
    requiresNamedAttendees: true,
    participantCountRequired: true,
  });
  return { serviceId: service.serviceId, room, staff };
}

export const roomPick = (serviceId: string, roomId: string): ResourceSelectionItem => ({
  serviceId,
  legIndex: null,
  resourceType: 'ROOM',
  resourceId: roomId,
});

export interface CustomerBooking {
  readonly bookingId: string;
  readonly customerEmail: string;
  // The customer's own page, signed in, for opening their view of the booking.
  readonly page: Page;
  readonly close: () => Promise<void>;
}

// Books as a brand-new signed-in customer in its own browser context (the manager keeps `page`).
export async function bookAsNewCustomer(
  browser: Browser,
  emailPrefix: string,
  tenantSlug: string,
  body: Record<string, unknown>,
): Promise<CustomerBooking> {
  const context = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
  });
  const page = await context.newPage();
  const customerEmail = uniqueTestEmail(emailPrefix);
  await loginAsCustomer(page, customerEmail, tenantSlug);
  await completeCustomerProfile(page, tenantSlug);
  const res = await page.request.post(`${BFF_URL}/bookings/authenticated`, {
    data: body,
    headers: { 'X-Web-Internal-Key': WEB_INTERNAL_KEY! },
  });
  if (!res.ok()) {
    await context.close();
    throw new Error(`customer booking failed: ${res.status()} ${await res.text()}`);
  }
  const created = (await res.json()) as { bookingId: string };
  return { bookingId: created.bookingId, customerEmail, page, close: () => context.close() };
}

// Cancels a booking from the staff detail page, with a reason the customer will be shown.
export async function cancelBookingInDashboard(
  page: Page,
  bookingId: string,
  reason: string,
): Promise<void> {
  await page.goto(`/dashboard/bookings/${bookingId}`);
  await page.getByRole('button', { name: 'Cancelar agendamento' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox').fill(reason);
  await dialog.getByRole('button', { name: 'Cancelar agendamento' }).click();
  await page.getByTestId('booking-cancelled-title').waitFor();
}
