import {
  LeadFormSubmissionAnswerSchema,
  LeadFormSubmissionFieldsSchema,
  ListLeadFormSubmissionsSchema,
} from './lead-form-submission';

describe('LeadFormSubmissionFieldsSchema', () => {
  const VALID = {
    name: 'Maria Silva',
    email: 'maria@example.com',
    phone: '+5511987654321',
    answers: [{ questionId: '01234567-0000-7000-8000-000000000101', value: 'Google' }],
  };

  it('accepts a valid payload', () => {
    expect(LeadFormSubmissionFieldsSchema.safeParse(VALID).success).toBe(true);
  });

  it('accepts an answer with an array value (multi-choice)', () => {
    const result = LeadFormSubmissionFieldsSchema.safeParse({
      ...VALID,
      answers: [{ questionId: VALID.answers[0].questionId, value: ['a', 'b'] }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty name', () => {
    expect(LeadFormSubmissionFieldsSchema.safeParse({ ...VALID, name: '' }).success).toBe(false);
  });

  it('rejects more than 20 answers', () => {
    const answers = Array.from({ length: 21 }, (_, i) => ({
      questionId: `01234567-0000-7000-8000-0000000001${String(i).padStart(2, '0')}`,
      value: 'x',
    }));
    expect(LeadFormSubmissionFieldsSchema.safeParse({ ...VALID, answers }).success).toBe(false);
  });

  it('rejects a non-uuid questionId', () => {
    const result = LeadFormSubmissionAnswerSchema.safeParse({
      questionId: 'not-a-uuid',
      value: 'x',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an answer string value over 2000 chars', () => {
    const result = LeadFormSubmissionAnswerSchema.safeParse({
      questionId: VALID.answers[0].questionId,
      value: 'x'.repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it('rejects an answer array with more than 50 options', () => {
    const result = LeadFormSubmissionAnswerSchema.safeParse({
      questionId: VALID.answers[0].questionId,
      value: Array.from({ length: 51 }, (_, i) => `option-${i}`),
    });
    expect(result.success).toBe(false);
  });

  it('rejects an answer array element over 2000 chars', () => {
    const result = LeadFormSubmissionAnswerSchema.safeParse({
      questionId: VALID.answers[0].questionId,
      value: ['a', 'x'.repeat(2001)],
    });
    expect(result.success).toBe(false);
  });
});

describe('ListLeadFormSubmissionsSchema (M20-S12)', () => {
  it('accepts an empty query, defaulting page/pageSize', () => {
    const result = ListLeadFormSubmissionsSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(20);
    }
  });

  it('accepts a valid search term', () => {
    expect(ListLeadFormSubmissionsSchema.safeParse({ search: 'casado' }).success).toBe(true);
  });

  // No 3-character minimum (reversed M20-S12 decision, M20-S13 story feedback, 2026-08-27) — a
  // short but real search term (e.g. an age, "25") must not be rejected outright.
  it('accepts a 1-2 character search term', () => {
    expect(ListLeadFormSubmissionsSchema.safeParse({ search: 'ab' }).success).toBe(true);
    expect(ListLeadFormSubmissionsSchema.safeParse({ search: '2' }).success).toBe(true);
  });

  it('rejects an empty search term', () => {
    const result = ListLeadFormSubmissionsSchema.safeParse({ search: '' });
    expect(result.success).toBe(false);
  });

  it('accepts a valid filters JSON array', () => {
    const result = ListLeadFormSubmissionsSchema.safeParse({
      filters: JSON.stringify([{ questionLabel: 'Estado civil', value: 'casado' }]),
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.filters).toEqual([{ questionLabel: 'Estado civil', value: 'casado' }]);
    }
  });

  it('rejects a malformed (non-JSON) filters string', () => {
    const result = ListLeadFormSubmissionsSchema.safeParse({ filters: 'not-json' });
    expect(result.success).toBe(false);
  });

  it('accepts a filters entry with a 1-2 character value', () => {
    const result = ListLeadFormSubmissionsSchema.safeParse({
      filters: JSON.stringify([{ questionLabel: 'Idade', value: '25' }]),
    });
    expect(result.success).toBe(true);
  });

  it('rejects a filters entry with an empty value', () => {
    const result = ListLeadFormSubmissionsSchema.safeParse({
      filters: JSON.stringify([{ questionLabel: 'Estado civil', value: '' }]),
    });
    expect(result.success).toBe(false);
  });

  it('rejects more than 5 filters entries', () => {
    const filters = Array.from({ length: 6 }, (_, i) => ({
      questionLabel: `Question ${i}`,
      value: 'value',
    }));
    const result = ListLeadFormSubmissionsSchema.safeParse({ filters: JSON.stringify(filters) });
    expect(result.success).toBe(false);
  });

  it('rejects search and filters both present in the same request', () => {
    const result = ListLeadFormSubmissionsSchema.safeParse({
      search: 'casado',
      filters: JSON.stringify([{ questionLabel: 'Estado civil', value: 'casado' }]),
    });
    expect(result.success).toBe(false);
  });

  it('accepts a valid submittedFrom/submittedTo date range', () => {
    const result = ListLeadFormSubmissionsSchema.safeParse({
      submittedFrom: '2026-01-01',
      submittedTo: '2026-01-31',
    });
    expect(result.success).toBe(true);
  });

  it('rejects submittedFrom after submittedTo', () => {
    const result = ListLeadFormSubmissionsSchema.safeParse({
      submittedFrom: '2026-02-01',
      submittedTo: '2026-01-01',
    });
    expect(result.success).toBe(false);
  });

  it('accepts submittedFrom equal to submittedTo (a single-day range)', () => {
    const result = ListLeadFormSubmissionsSchema.safeParse({
      submittedFrom: '2026-01-01',
      submittedTo: '2026-01-01',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-YYYY-MM-DD submittedFrom', () => {
    const result = ListLeadFormSubmissionsSchema.safeParse({ submittedFrom: '01/01/2026' });
    expect(result.success).toBe(false);
  });

  it('accepts a date range combined with search', () => {
    const result = ListLeadFormSubmissionsSchema.safeParse({
      search: 'casado',
      submittedFrom: '2026-01-01',
      submittedTo: '2026-01-31',
    });
    expect(result.success).toBe(true);
  });
});
