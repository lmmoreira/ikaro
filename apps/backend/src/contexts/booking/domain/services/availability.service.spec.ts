import { ScheduleClosureBuilder } from '../../../../test/builders/booking/schedule-closure.builder';
import { ScheduleOpeningBuilder } from '../../../../test/builders/booking/schedule-opening.builder';
import { nextWeekday } from '../../../../test/utils/date-helpers';
import type { BusinessHours } from '../../../../shared/value-objects/business-hours.vo';
import { BookedSlot } from '../booked-slot';
import { AvailabilityInput, AvailabilityService } from './availability.service';

// America/Sao_Paulo is UTC-3 (no DST since 2019). Local HH:MM + 03:00 = UTC.
const TZ = 'America/Sao_Paulo';
const UTC_OFFSET_HOURS = 3;

const DEFAULT_HOURS: BusinessHours = {
  timezone: TZ,
  monday: { open: '09:00', close: '18:00' },
  tuesday: { open: '09:00', close: '18:00' },
  wednesday: { open: '09:00', close: '18:00' },
  thursday: { open: '09:00', close: '18:00' },
  friday: { open: '09:00', close: '18:00' },
  saturday: { open: '09:00', close: '17:00' },
  sunday: null,
};

// Slots counted without any closures or bookings:
// Monday 09:00-18:00, 120 min total, 30 min granularity → starts 09:00..16:00 = 15 slots
// Monday 09:00-18:00, 120 min total, 15 min granularity → starts 09:00..16:00 = 29 slots
// Saturday 09:00-17:00, 120 min total, 30 min granularity → starts 09:00..15:00 = 13 slots

function utcIso(date: string, localHour: number, localMin = 0): string {
  const h = localHour + UTC_OFFSET_HOURS;
  return `${date}T${String(h).padStart(2, '0')}:${String(localMin).padStart(2, '0')}:00.000Z`;
}

function bookedSlot(date: string, localHour: number, durationMins: number): BookedSlot {
  return {
    id: 'slot-test-id',
    scheduledAt: new Date(utcIso(date, localHour)),
    totalDurationMins: durationMins,
  };
}

describe('AvailabilityService', () => {
  let svc: AvailabilityService;

  // Dates with stable day-of-week (computed at suite load time — always future).
  const monday = nextWeekday(1);
  const sunday = nextWeekday(0);
  const saturday = nextWeekday(6);

  const base: Omit<AvailabilityInput, 'date'> = {
    services: [{ durationMinutes: 60 }],
    businessHours: DEFAULT_HOURS,
    slotGranularityMinutes: 30,
    serviceBufferMinutes: 60, // totalMins = 120
    closures: [],
    opening: null,
    existingBookings: [],
  };

  beforeEach(() => {
    svc = new AvailabilityService();
  });

  // ── Three-layer resolution ──────────────────────────────────────────────────

  it('returns slots for a regular open day (Monday 09:00–18:00)', () => {
    const result = svc.calculate({ ...base, date: monday });

    expect(result).toHaveLength(15);
    expect(result[0].startsAt).toBe(utcIso(monday, 9));
    expect(result[14].startsAt).toBe(utcIso(monday, 16));
  });

  it('returns [] for a closed day with no ScheduleOpening (Sunday)', () => {
    const result = svc.calculate({ ...base, date: sunday });

    expect(result).toHaveLength(0);
  });

  it('returns [] when a full-day ScheduleClosure exists on an open day', () => {
    const closure = new ScheduleClosureBuilder().withDate(monday).build();

    const result = svc.calculate({ ...base, date: monday, closures: [closure] });

    expect(result).toHaveLength(0);
  });

  it('returns slots within opening window when ScheduleOpening exists on a closed day', () => {
    // Sunday is null in businessHours; opening makes it available 09:00–14:00.
    const opening = new ScheduleOpeningBuilder()
      .withDate(sunday)
      .withStartTime('09:00')
      .withEndTime('14:00')
      .build();

    const result = svc.calculate({ ...base, date: sunday, opening });

    // 09:00–14:00 = 300 min, 120 min total, 30 min granularity → starts 09:00..12:00 = 7 slots
    expect(result).toHaveLength(7);
    expect(result[0].startsAt).toBe(utcIso(sunday, 9));
    expect(result[6].startsAt).toBe(utcIso(sunday, 12));
  });

  it('uses ScheduleOpening window instead of businessHours even when day is already open', () => {
    // Monday is open 09:00–18:00 in businessHours.
    // Opening 10:00–14:00 should override it — not invalid here (domain service is pure).
    const opening = new ScheduleOpeningBuilder()
      .withDate(monday)
      .withStartTime('10:00')
      .withEndTime('14:00')
      .build();

    const result = svc.calculate({ ...base, date: monday, opening });

    // 10:00–14:00 = 240 min, 120 min total → starts 10:00..12:00 = 5 slots
    expect(result).toHaveLength(5);
    expect(result[0].startsAt).toBe(utcIso(monday, 10));
  });

  it('ScheduleOpening wins over a full-day ScheduleClosure on the same date', () => {
    const opening = new ScheduleOpeningBuilder()
      .withDate(sunday)
      .withStartTime('09:00')
      .withEndTime('14:00')
      .build();
    const closure = new ScheduleClosureBuilder().withDate(sunday).build();

    const result = svc.calculate({ ...base, date: sunday, opening, closures: [closure] });

    expect(result).toHaveLength(7); // opening takes full priority
  });

  it('ScheduleOpening wins over a partial ScheduleClosure on the same date', () => {
    const opening = new ScheduleOpeningBuilder()
      .withDate(sunday)
      .withStartTime('09:00')
      .withEndTime('14:00')
      .build();
    const closure = new ScheduleClosureBuilder()
      .withDate(sunday)
      .withStartTime('09:00')
      .withEndTime('11:00')
      .build();

    const result = svc.calculate({ ...base, date: sunday, opening, closures: [closure] });

    expect(result).toHaveLength(7); // partial closure ignored when opening exists
  });

  // ── Slot generation ─────────────────────────────────────────────────────────

  it('generates correct slot count for Saturday (09:00–17:00)', () => {
    const result = svc.calculate({ ...base, date: saturday });

    // 09:00–17:00 = 480 min, 120 min total → starts 09:00..15:00 = 13 slots
    expect(result).toHaveLength(13);
    expect(result[12].startsAt).toBe(utcIso(saturday, 15));
  });

  it('generates correct first and last slots for 15 min granularity and 75 min total', () => {
    const result = svc.calculate({
      ...base,
      date: monday,
      services: [{ durationMinutes: 15 }],
      serviceBufferMinutes: 60,
      slotGranularityMinutes: 15,
    });

    // totalMins = 75, 09:00–18:00, 15 min granularity → last start 16:45, 32 slots
    expect(result).toHaveLength(32);
    expect(result[0].startsAt).toBe(utcIso(monday, 9));
    expect(result[31].startsAt).toBe(utcIso(monday, 16, 45));
  });

  it('returns [] when total duration exceeds the entire business-hours window', () => {
    const result = svc.calculate({
      ...base,
      date: monday,
      services: [{ durationMinutes: 600 }],
      serviceBufferMinutes: 0,
    });

    expect(result).toHaveLength(0);
  });

  it('generates 17 slots with zero buffer and 60 min service', () => {
    const result = svc.calculate({
      ...base,
      date: monday,
      services: [{ durationMinutes: 60 }],
      serviceBufferMinutes: 0,
      slotGranularityMinutes: 30,
    });

    // totalMins = 60, 09:00–18:00 → last start 17:00, 17 slots
    expect(result).toHaveLength(17);
    expect(result[16].startsAt).toBe(utcIso(monday, 17));
  });

  it('sums multiple service durations correctly', () => {
    const result = svc.calculate({
      ...base,
      date: monday,
      services: [{ durationMinutes: 30 }, { durationMinutes: 30 }],
      serviceBufferMinutes: 60, // totalMins = 30+30+60 = 120
      slotGranularityMinutes: 30,
    });

    expect(result).toHaveLength(15);
  });

  // ── Partial closure blocking ─────────────────────────────────────────────────

  it('blocks slots whose window overlaps a partial closure 10:00–12:00', () => {
    const closure = new ScheduleClosureBuilder()
      .withDate(monday)
      .withStartTime('10:00')
      .withEndTime('12:00')
      .build();

    const result = svc.calculate({ ...base, date: monday, closures: [closure] });

    // Slots 09:00–11:30 overlap [10:00,12:00); first free start is 12:00
    const starts = result.map((s) => s.startsAt);
    expect(starts).not.toContain(utcIso(monday, 9));
    expect(starts).not.toContain(utcIso(monday, 9, 30));
    expect(starts).not.toContain(utcIso(monday, 11, 30));
    expect(starts).toContain(utcIso(monday, 12));
    // 12:00–16:00 = 9 slots
    expect(result).toHaveLength(9);
  });

  it('respects multiple partial closures independently', () => {
    const c1 = new ScheduleClosureBuilder()
      .withDate(monday)
      .withStartTime('09:30')
      .withEndTime('10:00')
      .build();
    const c2 = new ScheduleClosureBuilder()
      .withDate(monday)
      .withStartTime('13:00')
      .withEndTime('13:30')
      .build();

    const result = svc.calculate({ ...base, date: monday, closures: [c1, c2] });

    const starts = result.map((s) => s.startsAt);
    // 09:00 overlaps c1 [09:30,10:00)? [09:00,11:00) vs [09:30,10:00) → yes. Blocked.
    expect(starts).not.toContain(utcIso(monday, 9));
    // 11:30 overlaps c2 [13:00,13:30)? [11:30,13:30) vs [13:00,13:30) → yes. Blocked.
    expect(starts).not.toContain(utcIso(monday, 11, 30));
    // 12:00 overlaps c2 [13:00,13:30)? [12:00,14:00) → yes. Blocked.
    expect(starts).not.toContain(utcIso(monday, 12));
    // 12:30 overlaps c2? [12:30,14:30) vs [13:00,13:30) → yes. Blocked.
    expect(starts).not.toContain(utcIso(monday, 12, 30));
    // 13:30 overlaps c2 [13:00,13:30)? [13:30,15:30) vs [13:00,13:30) → 13:30<13:30 = false. Free.
    expect(starts).toContain(utcIso(monday, 13, 30));
  });

  // ── Existing booking blocking ────────────────────────────────────────────────

  it('blocks slots whose window overlaps an existing booking', () => {
    // Booking at 10:00 local for 60 min → [10:00, 11:00) local
    const slot = bookedSlot(monday, 10, 60);

    const result = svc.calculate({ ...base, date: monday, existingBookings: [slot] });

    const starts = result.map((s) => s.startsAt);
    // [09:00,11:00) overlaps [10:00,11:00) → blocked
    expect(starts).not.toContain(utcIso(monday, 9));
    expect(starts).not.toContain(utcIso(monday, 9, 30));
    expect(starts).not.toContain(utcIso(monday, 10));
    // [10:30,12:30) overlaps [10:00,11:00) → 10:30<11:00 && 10:00<12:30 → blocked
    expect(starts).not.toContain(utcIso(monday, 10, 30));
    // [11:00,13:00) vs [10:00,11:00) → 11:00<11:00 = false → free
    expect(starts).toContain(utcIso(monday, 11));
    expect(result).toHaveLength(11);
  });

  it('returns [] when an existing booking fills the entire available window', () => {
    // Booking occupies 09:00–18:00 local (540 min)
    const slot = bookedSlot(monday, 9, 540);

    const result = svc.calculate({ ...base, date: monday, existingBookings: [slot] });

    expect(result).toHaveLength(0);
  });

  it('handles multiple existing bookings blocking different windows', () => {
    const slot1 = bookedSlot(monday, 9, 60); // 09:00–10:00
    const slot2 = bookedSlot(monday, 14, 60); // 14:00–15:00

    const result = svc.calculate({ ...base, date: monday, existingBookings: [slot1, slot2] });

    const starts = result.map((s) => s.startsAt);
    // Slots near 09:00 blocked by slot1
    expect(starts).not.toContain(utcIso(monday, 9));
    // Slots near 14:00 blocked by slot2
    expect(starts).not.toContain(utcIso(monday, 13)); // [13:00,15:00) vs [14:00,15:00) → blocked
    expect(starts).not.toContain(utcIso(monday, 14));
    // 10:00 is free of slot1 ([10:00,12:00) vs [09:00,10:00) → 10:00<10:00=false)
    expect(starts).toContain(utcIso(monday, 10));
    // 15:00 is free of slot2 ([15:00,17:00) vs [14:00,15:00) → 15:00<15:00=false)
    expect(starts).toContain(utcIso(monday, 15));
  });

  it('concurrent partial closure and booking each block independently', () => {
    const closure = new ScheduleClosureBuilder()
      .withDate(monday)
      .withStartTime('09:00')
      .withEndTime('10:00')
      .build();
    const slot = bookedSlot(monday, 14, 60); // 14:00–15:00

    const result = svc.calculate({
      ...base,
      date: monday,
      closures: [closure],
      existingBookings: [slot],
    });

    const starts = result.map((s) => s.startsAt);
    expect(starts).not.toContain(utcIso(monday, 9)); // blocked by closure
    expect(starts).not.toContain(utcIso(monday, 13)); // blocked by booking
    expect(starts).toContain(utcIso(monday, 10)); // free from both
  });

  // ── UTC ISO-8601 output ──────────────────────────────────────────────────────

  it('returns all slots as UTC ISO-8601 strings', () => {
    const result = svc.calculate({ ...base, date: monday });

    for (const slot of result) {
      expect(slot.startsAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(slot.endsAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    }
  });

  it('converts local 09:00 America/Sao_Paulo correctly to UTC (UTC-3 → 12:00Z)', () => {
    const result = svc.calculate({ ...base, date: monday });

    expect(result[0].startsAt).toBe(utcIso(monday, 9)); // 12:00Z
    expect(result[0].endsAt).toBe(utcIso(monday, 11)); // 14:00Z (120 min later)
  });

  it('opening slot returns correct UTC ISO-8601 startsAt and endsAt', () => {
    const opening = new ScheduleOpeningBuilder()
      .withDate(sunday)
      .withStartTime('09:00')
      .withEndTime('11:00')
      .build();

    const result = svc.calculate({ ...base, date: sunday, opening });

    // 09:00–11:00 = 120 min, 120 min total → exactly 1 slot
    expect(result).toHaveLength(1);
    expect(result[0].startsAt).toBe(utcIso(sunday, 9));
    expect(result[0].endsAt).toBe(utcIso(sunday, 11));
  });

  // ── Edge cases ───────────────────────────────────────────────────────────────

  it('returns [] when opening window is smaller than total booking duration', () => {
    const opening = new ScheduleOpeningBuilder()
      .withDate(sunday)
      .withStartTime('09:00')
      .withEndTime('10:00') // only 60 min, need 120
      .build();

    const result = svc.calculate({ ...base, date: sunday, opening });

    expect(result).toHaveLength(0);
  });

  it('last slot exactly fits when slot ends at close time', () => {
    // 09:00–18:00, 30 min granularity, 120 min total → last start 16:00, ends 18:00
    const result = svc.calculate({ ...base, date: monday });

    const last = result[result.length - 1];
    expect(last.startsAt).toBe(utcIso(monday, 16));
    expect(last.endsAt).toBe(utcIso(monday, 18));
  });

  it('no bookings and no closures → all business-hour slots are available', () => {
    const withClosures = svc.calculate({
      ...base,
      date: monday,
      closures: [],
      existingBookings: [],
    });
    const withoutExtra = svc.calculate({ ...base, date: monday });

    expect(withClosures).toHaveLength(withoutExtra.length);
  });
});
