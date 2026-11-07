import { describe, expect, it } from 'vitest';
import type { LeadFormQuestion } from '@ikaro/types';
import { serverFieldError } from './lead-form-server-field';

const t = ((key: string) => key) as Parameters<typeof serverFieldError>[2];

const QUESTIONS: LeadFormQuestion[] = [
  { id: 'q-text', label: 'Qual serviço?', type: 'TEXT', required: true, order: 1 },
  {
    id: 'q-choice',
    label: 'Melhor dia?',
    type: 'SINGLE_CHOICE',
    required: true,
    order: 2,
    options: ['Seg', 'Ter'],
  },
];

describe('serverFieldError', () => {
  it.each([
    ['name', { name: 'leadForm.nameRequired' }],
    ['email', { email: 'leadForm.emailRequired' }],
    ['phone', { phone: 'leadForm.phoneRequired' }],
  ])('maps the contact field %s to its own message', (field, expected) => {
    expect(serverFieldError(field, QUESTIONS, t)).toEqual(expected);
  });

  it('maps answers.<questionId> to the question feedback field with the text message', () => {
    expect(serverFieldError('answers.q-text', QUESTIONS, t)).toEqual({
      'question:q-text': 'leadForm.questionRequired',
    });
  });

  it('uses the select-an-option message for a choice question', () => {
    expect(serverFieldError('answers.q-choice', QUESTIONS, t)).toEqual({
      'question:q-choice': 'leadForm.selectOption',
    });
  });

  it.each([[undefined], ['unknown'], ['answers.not-a-question'], ['answers[0].questionId']])(
    'returns null for %s so the form-level message stands alone',
    (field) => {
      expect(serverFieldError(field, QUESTIONS, t)).toBeNull();
    },
  );
});
