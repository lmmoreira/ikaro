import type { Page } from '@playwright/test';
import {
  createService,
  makeUniqueServiceName,
  setBookingPolicy,
  setResourceRequirements,
  setServiceLegs,
} from '../services';
import { seedResource } from './flow';

// Seeds for the bundle / journey / variable-duration booking specs (M23-S11b). Every resource is
// freshly created and every requirement restricted to it, so other specs' resources never leak
// into the picker or the availability.

export interface SeededResource {
  readonly id: string;
  readonly name: string;
}

export interface SeededService {
  readonly serviceId: string;
  readonly name: string;
}

async function newService(
  page: Page,
  prefix: string,
  durationMinutes: number,
  priceAmount: number,
): Promise<SeededService> {
  const service = await createService(page, {
    name: makeUniqueServiceName(prefix),
    priceAmount,
    durationMinutes,
    loyaltyPointsValue: 10,
  });
  return { serviceId: service.serviceId, name: service.name };
}

export interface SeededVariableDurationService {
  readonly service: SeededService;
  readonly room: SeededResource;
  readonly resourceIds: readonly string[];
}

// A per-time service (R$ 50,00 / hour, 1h to 3h in 1h steps) on its own room — the customer
// picks the duration and the server quotes the total.
export async function seedVariableDurationService(
  page: Page,
  prefix = 'e2e-por-tempo',
): Promise<SeededVariableDurationService> {
  const room = await seedResource(page, 'ROOM');
  const service = await newService(page, prefix, 60, 50);
  await setResourceRequirements(page, service.serviceId, [
    { type: 'ROOM', selectionMode: 'AUTO_FUNGIBLE_POOL', resourcePoolIds: [room.id] },
  ]);
  await setBookingPolicy(page, service.serviceId, {
    durationPolicy: 'CUSTOMER_SELECTED',
    durationMinMinutes: 60,
    durationMaxMinutes: 180,
    durationIncrementMinutes: 60,
    pricingPolicy: 'PER_TIME_INCREMENT',
    pricingIncrementMinutes: 60,
    pricePerIncrementAmount: 50,
    minimumChargeAmount: null,
  });
  return { service, room, resourceIds: [room.id] };
}

export interface SeededJourney {
  readonly service: SeededService;
  readonly autoRoom: SeededResource;
  readonly poolRoom: SeededResource;
  readonly staffs: readonly SeededResource[];
  readonly equipments: readonly SeededResource[];
  readonly resourceIds: readonly string[];
}

// Sauna (20, automatic room) +10 · Massagem (30, chosen staff + a fungible-pool room) +5 ·
// Relaxamento (20, chosen equipment): 20+10 + 30+5 + 20 = 85 min. The service's own duration is
// its legs' span (the backend writes it when the legs are set).
export async function seedJourney(page: Page, prefix = 'e2e-jornada'): Promise<SeededJourney> {
  const autoRoom = await seedResource(page, 'ROOM');
  const poolRoom = await seedResource(page, 'ROOM');
  const staffs = [await seedResource(page, 'STAFF'), await seedResource(page, 'STAFF')];
  const equipments = [await seedResource(page, 'EQUIPMENT'), await seedResource(page, 'EQUIPMENT')];
  const service = await newService(page, prefix, 85, 260);
  await setServiceLegs(page, service.serviceId, [
    {
      legIndex: 0,
      name: 'Sauna',
      durationMinutes: 20,
      transitionGapAfterMinutes: 10,
      resourceRequirements: [
        { type: 'ROOM', selectionMode: 'AUTO_ANY', resourcePoolIds: [autoRoom.id] },
      ],
    },
    {
      legIndex: 1,
      name: 'Massagem',
      durationMinutes: 30,
      transitionGapAfterMinutes: 5,
      resourceRequirements: [
        {
          type: 'STAFF',
          selectionMode: 'CUSTOMER_CHOICE',
          resourcePoolIds: staffs.map((s) => s.id),
        },
        { type: 'ROOM', selectionMode: 'AUTO_FUNGIBLE_POOL', resourcePoolIds: [poolRoom.id] },
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
  return {
    service,
    autoRoom,
    poolRoom,
    staffs,
    equipments,
    resourceIds: [
      autoRoom.id,
      poolRoom.id,
      ...staffs.map((s) => s.id),
      ...equipments.map((e) => e.id),
    ],
  };
}

export interface SeededBundle {
  readonly service: SeededService;
  readonly staffs: readonly SeededResource[];
  readonly room: SeededResource;
  readonly resourceIds: readonly string[];
}

// A bundle: a chosen staff member plus an automatic (fungible-pool) room — the customer is asked
// for the staff member only, and no room name ever reaches the customer.
export async function seedBundle(page: Page, prefix = 'e2e-pacote'): Promise<SeededBundle> {
  const staffs = [await seedResource(page, 'STAFF'), await seedResource(page, 'STAFF')];
  const room = await seedResource(page, 'ROOM');
  const service = await newService(page, prefix, 60, 180);
  await setResourceRequirements(page, service.serviceId, [
    { type: 'STAFF', selectionMode: 'CUSTOMER_CHOICE', resourcePoolIds: staffs.map((s) => s.id) },
    { type: 'ROOM', selectionMode: 'AUTO_FUNGIBLE_POOL', resourcePoolIds: [room.id] },
  ]);
  return { service, staffs, room, resourceIds: [...staffs.map((s) => s.id), room.id] };
}

// A plain fixed service (30 min, R$ 80,00) with no resource requirements beyond the default.
export async function seedFixedService(
  page: Page,
  prefix = 'e2e-avaliacao',
): Promise<SeededService> {
  return newService(page, prefix, 30, 80);
}

// "HH:MM–HH:MM" (a slot button) or "HH:MM – HH:MM" (a review row) -> minutes since midnight.
export function parseRange(text: string): { readonly start: number; readonly end: number } {
  const match = /(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/.exec(text);
  if (!match) throw new Error(`no time range in "${text}"`);
  const [, startHour, startMinute, endHour, endMinute] = match.map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  return { start: startHour * 60 + startMinute, end: endHour * 60 + endMinute };
}
