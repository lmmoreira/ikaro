import { RequestRecurringBookingScheduleBodySchema } from './recurring-booking-schedules.schemas';

const validBody = {
  serviceId: '00000000-0000-4000-8000-000000000002',
  recurrence: {
    frequency: 'WEEKLY' as const,
    daysOfWeek: ['tuesday' as const],
    startTime: '10:00',
    durationMinutes: 60,
  },
  assignmentPolicy: 'FIXED_ASSIGNMENT' as const,
  resourceIds: ['00000000-0000-4000-8000-000000000003'],
  startsOn: '2026-09-01',
  endsOn: '2026-11-24',
};

describe('RequestRecurringBookingScheduleBodySchema', () => {
  it('accepts a body with an end date', () => {
    expect(RequestRecurringBookingScheduleBodySchema.safeParse(validBody).success).toBe(true);
  });

  it('rejects a body without endsOn — a schedule is a fixed term, never open-ended', () => {
    const result = RequestRecurringBookingScheduleBodySchema.safeParse({
      ...validBody,
      endsOn: undefined,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toContain('endsOn');
  });

  it('rejects a null endsOn', () => {
    expect(
      RequestRecurringBookingScheduleBodySchema.safeParse({ ...validBody, endsOn: null }).success,
    ).toBe(false);
  });

  it('rejects a malformed endsOn', () => {
    expect(
      RequestRecurringBookingScheduleBodySchema.safeParse({ ...validBody, endsOn: '24/11/2026' })
        .success,
    ).toBe(false);
  });
});
