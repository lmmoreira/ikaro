import { describe, expect, it } from 'vitest';
import { wallTimeToOffsetIso } from './zoned-time';

describe('wallTimeToOffsetIso()', () => {
  it('reads the wall time in the tenant timezone, not the machine one (Sao Paulo, UTC-3)', () => {
    expect(wallTimeToOffsetIso('2026-10-20T09:00', 'America/Sao_Paulo')).toBe(
      '2026-10-20T09:00:00-03:00',
    );
  });

  it('uses the offset in force on that date — Berlin is +02:00 in summer and +01:00 in winter', () => {
    expect(wallTimeToOffsetIso('2026-07-01T12:30', 'Europe/Berlin')).toBe(
      '2026-07-01T12:30:00+02:00',
    );
    expect(wallTimeToOffsetIso('2026-12-01T12:30', 'Europe/Berlin')).toBe(
      '2026-12-01T12:30:00+01:00',
    );
  });

  it('handles a half-hour offset zone (Kolkata, +05:30)', () => {
    expect(wallTimeToOffsetIso('2026-10-20T09:00', 'Asia/Kolkata')).toBe(
      '2026-10-20T09:00:00+05:30',
    );
  });

  it('handles UTC', () => {
    expect(wallTimeToOffsetIso('2026-10-20T23:59', 'UTC')).toBe('2026-10-20T23:59:00+00:00');
  });

  it('keeps the wall time across a DST change (New York, 2026-03-08 spring forward)', () => {
    expect(wallTimeToOffsetIso('2026-03-08T12:00', 'America/New_York')).toBe(
      '2026-03-08T12:00:00-04:00',
    );
    expect(wallTimeToOffsetIso('2026-03-07T12:00', 'America/New_York')).toBe(
      '2026-03-07T12:00:00-05:00',
    );
  });

  it('describes the same instant as the equivalent UTC time', () => {
    const iso = wallTimeToOffsetIso('2026-10-20T09:00', 'America/Sao_Paulo') ?? '';

    expect(new Date(iso).toISOString()).toBe('2026-10-20T12:00:00.000Z');
  });

  it('returns null for a malformed value', () => {
    expect(wallTimeToOffsetIso('', 'UTC')).toBeNull();
    expect(wallTimeToOffsetIso('2026-10-20', 'UTC')).toBeNull();
    expect(wallTimeToOffsetIso('20/10/2026 09:00', 'UTC')).toBeNull();
  });
});
