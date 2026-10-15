import type { APIResponse, Page } from '@playwright/test';
import type {
  DayGridResponse,
  ResourceSelectionItem,
  StaffBookingCardResponse,
  StaffBookingDetailResponse,
  StaffBookingListResponse,
} from '@ikaro/types';
import { BFF_URL, WEB_INTERNAL_KEY } from './auth/shared';
import { deactivateResource } from './booking';
import { findFirstSlot, seedResource, slotsOnDate, TENANT_SLUG } from './booking-form';
import {
  createService,
  deactivateService,
  makeUniqueServiceName,
  setResourceRequirements,
} from './services';

// M23-S14 — "Reservas a resolver". The entries are created the way a real manager creates them:
// bookings are made on a resource, then the resource is deactivated (UC-047 → UC-073). Every spec
// seeds its own freshly created resources and service, restricted into the requirement's pool, so
// the shared tenant's other resources and the entries other specs left open never mix in — specs
// find their rows by the unique resource name.

const internalHeaders = () => ({ 'X-Web-Internal-Key': WEB_INTERNAL_KEY! });

async function readJson<T>(res: APIResponse, action: string): Promise<T> {
  if (!res.ok()) throw new Error(`${action} failed: ${res.status()} ${await res.text()}`);
  return (await res.json()) as T;
}

export interface SeededWorklistBooking {
  readonly bookingId: string;
  readonly contactName: string;
  readonly startsAt: string;
  // The status the booking really has after the seed (a tenant may auto-approve).
  readonly status: string;
}

export interface SeedOptions {
  // CUSTOMER_CHOICE (default): every booking is pinned to one room. AUTO_ANY: the system picks a
  // room of the pool, so a deactivated room can be re-resolved on a reschedule (a customer-chosen
  // one cannot — docs/27). Use AUTO_ANY with a single plan: the bookings would not share a room.
  readonly selection?: 'CUSTOMER_CHOICE' | 'AUTO_ANY';
}

export interface WorklistSeed {
  readonly serviceId: string;
  readonly source: { readonly id: string; readonly name: string };
  readonly alternative: { readonly id: string; readonly name: string };
  readonly bookings: readonly SeededWorklistBooking[];
  readonly cleanup: () => Promise<void>;
}

const roomPick = (serviceId: string, resourceId: string): ResourceSelectionItem => ({
  serviceId,
  legIndex: null,
  resourceType: 'ROOM',
  resourceId,
});

async function approve(page: Page, bookingId: string): Promise<void> {
  const res = await page.request.patch(`${BFF_URL}/bookings/${bookingId}/approve`, {
    data: {},
    headers: internalHeaders(),
  });
  if (!res.ok()) throw new Error(`approve booking failed: ${res.status()} ${await res.text()}`);
}

async function getBookingStatus(page: Page, bookingId: string): Promise<string> {
  const res = await page.request.get(`${BFF_URL}/bookings/${bookingId}`, {
    headers: internalHeaders(),
  });
  return (await readJson<StaffBookingDetailResponse>(res, 'read booking')).status;
}

// A guest booking on `resourceId` at the first candidate slot that is still free (a fixed-slot
// fixture on a shared tenant: another spec may have taken it, so a 409 moves to the next slot).
async function bookOnResource(
  page: Page,
  input: {
    readonly serviceId: string;
    // Pins the room (CUSTOMER_CHOICE). Omitted for AUTO_ANY: the system picks one of the pool.
    readonly resourceId?: string;
    readonly contactName: string;
    readonly candidates: readonly string[];
  },
): Promise<{ readonly bookingId: string; readonly startsAt: string }> {
  const { serviceId, resourceId, contactName, candidates } = input;
  for (const startsAt of candidates) {
    const res = await page.request.post(`${BFF_URL}/bookings`, {
      headers: { 'X-Tenant-Slug': TENANT_SLUG, ...internalHeaders() },
      data: {
        contactName,
        contactEmail: `worklist-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.example.com`,
        contactPhone: '+5531999999999',
        scheduledAt: startsAt,
        serviceIds: [serviceId],
        ...(resourceId ? { resourceSelections: [roomPick(serviceId, resourceId)] } : {}),
      },
    });
    if (res.status() === 409) continue;
    const { bookingId } = await readJson<{ bookingId: string }>(res, 'guest booking on a resource');
    return { bookingId, startsAt };
  }
  throw new Error(`no free slot left for ${contactName}`);
}

// Seeds one booking per plan on a fresh "source" room, then deactivates the room, which raises one
// open entry per booking. `approve: true` plans end APPROVED (the card shows Reagendar); the
// others stay as the tenant leaves a new guest booking (normally PENDING, no Reagendar).
// The page must already be logged in as a MANAGER.
export async function seedWorklistEntries(
  page: Page,
  plans: ReadonlyArray<{ readonly approve: boolean }>,
  options: SeedOptions = {},
): Promise<WorklistSeed> {
  const autoAny = options.selection === 'AUTO_ANY';
  const first = await seedResource(page, 'ROOM');
  const second = await seedResource(page, 'ROOM');
  // CUSTOMER_CHOICE pins every booking to `first`. AUTO_ANY lets the system choose, so the source
  // is whichever room the first booking landed on (resolved below).
  let source = first;
  let alternative = second;
  const service = await createService(page, {
    name: makeUniqueServiceName('e2e-reservas-a-resolver'),
    description: 'Serviço de teste M23-S14',
    priceAmount: 150,
    durationMinutes: 60,
    loyaltyPointsValue: 10,
    requiresPickupAddress: false,
    isActive: true,
  });
  await setResourceRequirements(page, service.serviceId, [
    {
      type: 'ROOM',
      selectionMode: autoAny ? 'AUTO_ANY' : 'CUSTOMER_CHOICE',
      resourcePoolIds: [first.id, second.id],
      requiredQuantity: 1,
    },
  ]);

  const picks = autoAny ? [] : [roomPick(service.serviceId, first.id)];
  const firstSlot = await findFirstSlot(page, service.serviceId, picks);
  const free = (await slotsOnDate(page, service.serviceId, firstSlot.date, picks)).map(
    (slot) => slot.startsAt,
  );

  const bookings: SeededWorklistBooking[] = [];
  let next = 0;
  for (const [index, plan] of plans.entries()) {
    const contactName = `Worklist ${Date.now().toString(36)}${index}`;
    // One hour apart is two slots; skip ahead so two seeded bookings never overlap.
    const created = await bookOnResource(page, {
      serviceId: service.serviceId,
      ...(autoAny ? {} : { resourceId: first.id }),
      contactName,
      candidates: free.slice(next),
    });
    next = free.indexOf(created.startsAt) + 3;
    if (plan.approve) await approve(page, created.bookingId);
    bookings.push({
      bookingId: created.bookingId,
      contactName,
      startsAt: created.startsAt,
      status: await getBookingStatus(page, created.bookingId),
    });
  }

  if (autoAny) {
    const card = await findBookingCard(page, bookings[0].bookingId, bookings[0].startsAt);
    const landedOn = card?.assignedResources.map((r) => r.resourceId) ?? [];
    // Deactivating the wrong room raises no entry for this booking and the spec would time out far
    // from the cause, so an unidentifiable room fails the seed right here.
    if (!landedOn.includes(first.id) && !landedOn.includes(second.id)) {
      throw new Error(
        `the AUTO_ANY booking landed on neither seeded room (saw ${landedOn.join(', ') || 'none'})`,
      );
    }
    if (landedOn.includes(second.id)) [source, alternative] = [second, first];
  }

  await deactivateResource(page, source.id);

  return {
    serviceId: service.serviceId,
    source,
    alternative,
    bookings,
    cleanup: async () => {
      // A booking still active on the alternative room would raise a fresh open entry when the room
      // is deactivated, and those pile up on the shared tenant: cancel what is left first (a booking
      // a spec already cancelled just answers with an error, which is fine).
      for (const booking of bookings) {
        await page.request.patch(`${BFF_URL}/bookings/${booking.bookingId}/cancel`, {
          data: {},
          headers: internalHeaders(),
        });
      }
      await deactivateService(page, service.serviceId);
      await deactivateResource(page, alternative.id);
    },
  };
}

// The sidebar badge's source: how many entries are still open for this tenant.
export async function readOpenWorklistCount(page: Page): Promise<number> {
  const res = await page.request.get(`${BFF_URL}/scheduling-exceptions/count`, {
    headers: internalHeaders(),
  });
  return (await readJson<{ count: number }>(res, 'worklist count')).count;
}

// The booking as the staff queue lists it, to prove where it ended up (its resources) and when.
export async function findBookingCard(
  page: Page,
  bookingId: string,
  startsAt: string,
): Promise<StaffBookingCardResponse | undefined> {
  const day = startsAt.slice(0, 10);
  for (const status of ['APPROVED', 'PENDING', 'CANCELLED']) {
    const res = await page.request.get(
      `${BFF_URL}/bookings?status=${status}&from=${day}&to=${day}&limit=100`,
      { headers: internalHeaders() },
    );
    if (!res.ok()) continue;
    const list = (await res.json()) as StaffBookingListResponse;
    const match = list.items.find((item) => item.bookingId === bookingId);
    if (match) return match;
  }
  return undefined;
}

// Where a resource is booked right now, from the day grid (the live occupancy of each active
// resource). The staff queue's `assignedResources` is NOT used to prove a reassign: it reads the
// immutable assignment audit table, which keeps every resource a booking ever had.
export async function readBookedStarts(
  page: Page,
  resourceId: string,
  anyStartsAt: string,
): Promise<number[]> {
  const date = new Date(anyStartsAt).toLocaleDateString('en-CA', {
    timeZone: 'America/Sao_Paulo',
  });
  const res = await page.request.get(`${BFF_URL}/schedule/day-grid?date=${date}`, {
    headers: internalHeaders(),
  });
  const grid = await readJson<DayGridResponse>(res, 'day grid');
  const column = grid.columns.find((c) => c.resourceId === resourceId);
  return (column?.blocks ?? []).map((block) => new Date(block.startsAt).getTime());
}

export async function readBookingDetail(
  page: Page,
  bookingId: string,
): Promise<StaffBookingDetailResponse> {
  const res = await page.request.get(`${BFF_URL}/bookings/${bookingId}`, {
    headers: internalHeaders(),
  });
  return readJson<StaffBookingDetailResponse>(res, 'read booking');
}
