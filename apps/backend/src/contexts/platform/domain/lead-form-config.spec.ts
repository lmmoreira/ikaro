import { LeadFormConfig } from './lead-form-config.aggregate';
import {
  LeadFormQuestionDuplicateIdError,
  LeadFormQuestionLabelRequiredError,
  LeadFormQuestionLimitReachedError,
  LeadFormQuestionOptionsInvalidError,
} from './errors/lead-form-domain.error';
import {
  makeLeadFormQuestion as makeQuestion,
  makeLeadFormQuestions as makeQuestions,
} from '../../../test/builders/platform/lead-form-config.builder';

const TENANT_ID = '01234567-0000-7000-8000-000000000001';

describe('LeadFormConfig', () => {
  describe('create()', () => {
    it('defaults to GUEST_AND_CUSTOMER audience mode and an empty question array', () => {
      const config = LeadFormConfig.create(TENANT_ID);

      expect(config.tenantId).toBe(TENANT_ID);
      expect(config.audienceMode).toBe('GUEST_AND_CUSTOMER');
      expect(config.questions).toEqual([]);
    });
  });

  describe('updateAudienceMode()', () => {
    it('replaces the audience mode', () => {
      const config = LeadFormConfig.create(TENANT_ID);

      config.updateAudienceMode('CUSTOMER_ONLY');

      expect(config.audienceMode).toBe('CUSTOMER_ONLY');
    });
  });

  describe('updateQuestions() — question count bound', () => {
    it('accepts exactly 20 questions', () => {
      const config = LeadFormConfig.create(TENANT_ID);

      expect(() => config.updateQuestions(makeQuestions(20))).not.toThrow();
      expect(config.questions).toHaveLength(20);
    });

    it('rejects 21 questions', () => {
      const config = LeadFormConfig.create(TENANT_ID);

      expect(() => config.updateQuestions(makeQuestions(21))).toThrow(
        LeadFormQuestionLimitReachedError,
      );
    });
  });

  describe('updateQuestions() — choice-type options bound', () => {
    it('accepts exactly 2 options for a SINGLE_CHOICE question', () => {
      const config = LeadFormConfig.create(TENANT_ID);
      const question = makeQuestion({ type: 'SINGLE_CHOICE', options: ['A', 'B'] });

      expect(() => config.updateQuestions([question])).not.toThrow();
    });

    it('rejects 1 option for a SINGLE_CHOICE question', () => {
      const config = LeadFormConfig.create(TENANT_ID);
      const question = makeQuestion({ type: 'SINGLE_CHOICE', options: ['A'] });

      expect(() => config.updateQuestions([question])).toThrow(LeadFormQuestionOptionsInvalidError);
    });

    it('accepts exactly 10 options for a MULTIPLE_CHOICE question', () => {
      const config = LeadFormConfig.create(TENANT_ID);
      const question = makeQuestion({
        type: 'MULTIPLE_CHOICE',
        options: Array.from({ length: 10 }, (_, i) => `Option ${i}`),
      });

      expect(() => config.updateQuestions([question])).not.toThrow();
    });

    it('rejects 11 options for a MULTIPLE_CHOICE question', () => {
      const config = LeadFormConfig.create(TENANT_ID);
      const question = makeQuestion({
        type: 'MULTIPLE_CHOICE',
        options: Array.from({ length: 11 }, (_, i) => `Option ${i}`),
      });

      expect(() => config.updateQuestions([question])).toThrow(LeadFormQuestionOptionsInvalidError);
    });

    it('does not enforce the options bound for a TEXT question', () => {
      const config = LeadFormConfig.create(TENANT_ID);
      const question = makeQuestion({ type: 'TEXT', options: undefined });

      expect(() => config.updateQuestions([question])).not.toThrow();
    });
  });

  describe('updateQuestions() — duplicate id', () => {
    it('rejects two questions sharing the same id', () => {
      const config = LeadFormConfig.create(TENANT_ID);
      const questionA = makeQuestion({ id: 'dup-id', order: 0 });
      const questionB = makeQuestion({ id: 'dup-id', order: 1 });

      expect(() => config.updateQuestions([questionA, questionB])).toThrow(
        LeadFormQuestionDuplicateIdError,
      );
    });

    it('accepts questions with distinct ids', () => {
      const config = LeadFormConfig.create(TENANT_ID);

      expect(() => config.updateQuestions(makeQuestions(2))).not.toThrow();
    });
  });

  describe('updateQuestions() — empty label', () => {
    it('rejects a question with an empty label', () => {
      const config = LeadFormConfig.create(TENANT_ID);
      const question = makeQuestion({ label: '' });

      expect(() => config.updateQuestions([question])).toThrow(LeadFormQuestionLabelRequiredError);
    });

    it('rejects a question with a whitespace-only label', () => {
      const config = LeadFormConfig.create(TENANT_ID);
      const question = makeQuestion({ label: '   ' });

      expect(() => config.updateQuestions([question])).toThrow(LeadFormQuestionLabelRequiredError);
    });
  });

  describe('reconstitute()', () => {
    it('restores all props without re-validating', () => {
      const updatedAt = new Date('2026-08-24T10:00:00Z');

      const config = LeadFormConfig.reconstitute({
        tenantId: TENANT_ID,
        audienceMode: 'CUSTOMER_ONLY',
        questions: [makeQuestion()],
        updatedAt,
      });

      expect(config.tenantId).toBe(TENANT_ID);
      expect(config.audienceMode).toBe('CUSTOMER_ONLY');
      expect(config.questions).toHaveLength(1);
      expect(config.updatedAt).toBe(updatedAt);
    });
  });
});
