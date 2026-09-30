import {
  DismissSchedulingExceptionsBodySchema,
  ListSchedulingExceptionsQuerySchema,
  MAX_SCHEDULING_EXCEPTION_BATCH,
  ReassignTargetSchema,
  ResolveSchedulingExceptionsBodySchema,
} from './scheduling-exception';

const ID_A = '00000000-0000-7000-8000-00000000000a';
const ID_B = '00000000-0000-7000-8000-00000000000b';

describe('ListSchedulingExceptionsQuerySchema', () => {
  it('accepts no status, or one of the three', () => {
    expect(ListSchedulingExceptionsQuerySchema.safeParse({}).success).toBe(true);
    for (const status of ['OPEN', 'RESOLVED', 'DISMISSED']) {
      expect(ListSchedulingExceptionsQuerySchema.safeParse({ status }).success).toBe(true);
    }
  });

  it('rejects an unknown status', () => {
    expect(ListSchedulingExceptionsQuerySchema.safeParse({ status: 'DONE' }).success).toBe(false);
  });
});

describe('ReassignTargetSchema', () => {
  it('accepts an explicit resource or AUTO', () => {
    expect(ReassignTargetSchema.safeParse({ resourceId: ID_A }).success).toBe(true);
    expect(ReassignTargetSchema.safeParse({ mode: 'AUTO' }).success).toBe(true);
  });

  it('rejects an unknown mode, both keys together and an empty object', () => {
    expect(ReassignTargetSchema.safeParse({ mode: 'RANDOM' }).success).toBe(false);
    expect(ReassignTargetSchema.safeParse({ resourceId: ID_A, mode: 'AUTO' }).success).toBe(false);
    expect(ReassignTargetSchema.safeParse({}).success).toBe(false);
  });
});

describe('ResolveSchedulingExceptionsBodySchema', () => {
  const parse = (body: unknown) => ResolveSchedulingExceptionsBodySchema.safeParse(body);
  const paths = (body: unknown): string[] => {
    const result = parse(body);
    return result.success ? [] : result.error.issues.map((i) => i.path.join('.'));
  };

  it.each([
    ['KEEP', { exceptionIds: [ID_A, ID_B], resolutionType: 'KEEP' }],
    ['CANCEL', { exceptionIds: [ID_A], resolutionType: 'CANCEL', reason: 'room closed' }],
    [
      'REASSIGN to a resource',
      { exceptionIds: [ID_A, ID_B], resolutionType: 'REASSIGN', target: { resourceId: ID_A } },
    ],
    [
      'REASSIGN AUTO',
      { exceptionIds: [ID_A], resolutionType: 'REASSIGN', target: { mode: 'AUTO' } },
    ],
    [
      'RESCHEDULE one entry',
      {
        exceptionIds: [ID_A],
        resolutionType: 'RESCHEDULE',
        scheduledAt: '2027-03-10T12:00:00.000Z',
      },
    ],
  ])('accepts %s', (_label, body) => {
    expect(parse(body).success).toBe(true);
  });

  it('requires a target for REASSIGN and forbids it otherwise', () => {
    expect(paths({ exceptionIds: [ID_A], resolutionType: 'REASSIGN' })).toEqual(['target']);
    expect(
      paths({ exceptionIds: [ID_A], resolutionType: 'CANCEL', target: { mode: 'AUTO' } }),
    ).toEqual(['target']);
  });

  it('requires scheduledAt for RESCHEDULE and forbids it otherwise', () => {
    expect(paths({ exceptionIds: [ID_A], resolutionType: 'RESCHEDULE' })).toEqual(['scheduledAt']);
    expect(
      paths({
        exceptionIds: [ID_A],
        resolutionType: 'KEEP',
        scheduledAt: '2027-03-10T12:00:00.000Z',
      }),
    ).toEqual(['scheduledAt']);
  });

  it('refuses RESCHEDULE for more than one entry', () => {
    expect(
      paths({
        exceptionIds: [ID_A, ID_B],
        resolutionType: 'RESCHEDULE',
        scheduledAt: '2027-03-10T12:00:00.000Z',
      }),
    ).toEqual(['exceptionIds']);
  });

  it('bounds the batch to 1–100 distinct ids', () => {
    expect(parse({ exceptionIds: [], resolutionType: 'KEEP' }).success).toBe(false);
    expect(parse({ exceptionIds: [ID_A, ID_A], resolutionType: 'KEEP' }).success).toBe(false);
    const tooMany = Array.from(
      { length: MAX_SCHEDULING_EXCEPTION_BATCH + 1 },
      (_, i) => `00000000-0000-7000-8000-${String(i).padStart(12, '0')}`,
    );
    expect(parse({ exceptionIds: tooMany, resolutionType: 'KEEP' }).success).toBe(false);
    expect(parse({ exceptionIds: ['not-a-uuid'], resolutionType: 'KEEP' }).success).toBe(false);
  });

  it('rejects an unknown resolution type and an empty or oversized reason', () => {
    expect(parse({ exceptionIds: [ID_A], resolutionType: 'IGNORE' }).success).toBe(false);
    expect(parse({ exceptionIds: [ID_A], resolutionType: 'KEEP', reason: '   ' }).success).toBe(
      false,
    );
    expect(
      parse({ exceptionIds: [ID_A], resolutionType: 'KEEP', reason: 'x'.repeat(501) }).success,
    ).toBe(false);
  });
});

describe('DismissSchedulingExceptionsBodySchema', () => {
  it('requires ids and a reason', () => {
    expect(
      DismissSchedulingExceptionsBodySchema.safeParse({ exceptionIds: [ID_A], reason: 'handled' })
        .success,
    ).toBe(true);
    expect(DismissSchedulingExceptionsBodySchema.safeParse({ exceptionIds: [ID_A] }).success).toBe(
      false,
    );
    expect(
      DismissSchedulingExceptionsBodySchema.safeParse({ exceptionIds: [ID_A], reason: '' }).success,
    ).toBe(false);
  });
});
