import { RequestRecurringBookingScheduleBodySchema } from './recurring-booking-schedules.schemas';

const validBody = {
  serviceId: '00000000-0000-4000-8000-000000000002',
  recurrence: {
    frequency: 'WEEKLY' as const,
    daysOfWeek: ['tuesday' as const],
    startTime: '10:00',
    durationMinutes: 60,
  },
  resourceSelections: [
    { resourceType: 'STAFF' as const, resourceId: '00000000-0000-4000-8000-000000000003' },
    { resourceType: 'ROOM' as const, resourceId: '00000000-0000-4000-8000-000000000004' },
  ],
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

  it('accepts a body with no resource selection (an automatic or default-shape service)', () => {
    const result = RequestRecurringBookingScheduleBodySchema.safeParse({
      ...validBody,
      resourceSelections: undefined,
    });

    expect(result.success).toBe(true);
  });

  it('accepts one selection per requirement of a bundle', () => {
    const result = RequestRecurringBookingScheduleBodySchema.safeParse(validBody);

    expect(result.success && result.data.resourceSelections).toHaveLength(2);
  });

  it('rejects a selection with an unknown resource type or a non-uuid resource id', () => {
    const badType = RequestRecurringBookingScheduleBodySchema.safeParse({
      ...validBody,
      resourceSelections: [{ resourceType: 'BOAT', resourceId: validBody.serviceId }],
    });
    const badId = RequestRecurringBookingScheduleBodySchema.safeParse({
      ...validBody,
      resourceSelections: [{ resourceType: 'ROOM', resourceId: 'room-1' }],
    });

    expect(badType.success).toBe(false);
    expect(badId.success).toBe(false);
  });

  it('no longer carries the assignment policy or a resource id list in the contract', () => {
    const result = RequestRecurringBookingScheduleBodySchema.safeParse({
      ...validBody,
      assignmentPolicy: 'FIXED_ASSIGNMENT',
      resourceIds: [validBody.serviceId],
    });

    expect(result.success && result.data).not.toHaveProperty('assignmentPolicy');
    expect(result.success && result.data).not.toHaveProperty('resourceIds');
  });
});
