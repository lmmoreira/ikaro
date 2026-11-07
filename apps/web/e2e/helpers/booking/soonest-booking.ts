import type { Page } from '@playwright/test';
import { loginAsStaff } from '../auth/staff-login';
import { MANAGER_EMAIL, TENANT_SLUG } from '../booking-form/flow';
import { seedSingleRoomService } from '../booking-form/seeds';
import { deactivateService } from '../services';
import { createFreshApprovedBooking } from './approve-booking';
import type { AuthenticatedBookingSetup } from './create-booking';
import { deactivateResource } from './resource-api';

export interface SoonestBookingInOwnRoom {
  readonly setup: AuthenticatedBookingSetup;
  /** Deactivates the room and the service this booking was made on. Call it from a `finally`. */
  readonly cleanup: () => Promise<void>;
}

// An APPROVED booking that starts within the next 48 hours (inside every cancellation and
// reschedule window), made on a room and a service of its own.
//
// Why not the shared seeded service: "within 48 hours" leaves few open slots, and on a UTC Saturday
// only the Saturday afternoon is left (the tenant is closed on Sunday), which is two bookings'
// worth. Every spec that took a `'soonest'` slot on the shared service competed for those two, so
// whichever ran third failed with a 409 on every candidate, and only on the weekday its run
// happened to fall on. On a room of its own the booking competes with nobody, so the outcome no
// longer depends on what else ran in the shard or on the day of the week.
//
// The service lasts 30 minutes, the length the `'soonest'` slot candidates are sized for.
export async function createSoonestApprovedBookingInOwnRoom(
  page: Page,
  options: {
    readonly prefix: string;
    readonly contactEmail: string;
    readonly staffEmail: string;
  },
): Promise<SoonestBookingInOwnRoom> {
  await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
  const { service, room } = await seedSingleRoomService(page, options.prefix, 30);

  const cleanup = async (): Promise<void> => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    await deactivateService(page, service.serviceId);
    await deactivateResource(page, room.id);
  };

  try {
    const setup = await createFreshApprovedBooking(page, 'soonest', options.staffEmail, {
      contactEmail: options.contactEmail,
      serviceIds: [service.serviceId],
    });
    return { setup, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
