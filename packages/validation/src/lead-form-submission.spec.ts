import {
  LeadFormSubmissionAnswerSchema,
  LeadFormSubmissionFieldsSchema,
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
});
