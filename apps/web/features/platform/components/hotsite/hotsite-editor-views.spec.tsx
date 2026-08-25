// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { extractLeadFormConfig, hasInvalidLeadFormQuestion } from './hotsite-editor-views';

describe('hotsite editor lead-form view helpers', () => {
  it('strips submission metadata before building the editable config', () => {
    const config = extractLeadFormConfig({
      audienceMode: 'CUSTOMER_ONLY',
      questions: [
        { id: 'q1', label: 'Nome', type: 'TEXT', required: true, order: 0, hasSubmissions: true },
      ],
    });
    expect(config?.questions[0]).not.toHaveProperty('hasSubmissions');
  });

  it('rejects incomplete choice questions', () => {
    expect(
      hasInvalidLeadFormQuestion({
        audienceMode: 'CUSTOMER_ONLY',
        questions: [
          {
            id: 'q1',
            label: 'Serviço',
            type: 'SINGLE_CHOICE',
            required: true,
            order: 0,
            options: [''],
          },
        ],
      }),
    ).toBe(true);
  });
});
