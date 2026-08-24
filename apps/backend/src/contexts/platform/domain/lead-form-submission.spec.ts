import { EmailErrorCode, PhoneErrorCode } from '@ikaro/types';
import { EmailValidationError } from '../../../shared/value-objects/email.vo';
import { PhoneNumberValidationError } from '../../../shared/value-objects/phone-number.vo';
import { LeadFormSubmissionBuilder } from '../../../test/builders/platform/lead-form-submission.builder';
import { LeadFormSubmissionNameRequiredError } from './errors/lead-form-domain.error';
import { LeadFormSubmissionReceived } from './events/lead-form-submission-received.event';
import {
  CreateLeadFormSubmissionParams,
  LeadFormAnswer,
  LeadFormSubmission,
} from './lead-form-submission.aggregate';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const CUSTOMER_ID = '00000000-0000-7000-8000-000000000002';
const CORRELATION_ID = 'corr-lead-form-submission-test';

const ANSWERS: LeadFormAnswer[] = [
  {
    questionId: 'q1',
    questionLabel: 'Como você nos conheceu?',
    questionType: 'TEXT',
    answerValue: 'Instagram',
  },
];

function baseParams(
  overrides: Partial<CreateLeadFormSubmissionParams> = {},
): CreateLeadFormSubmissionParams {
  return {
    tenantId: TENANT_ID,
    customerId: null,
    name: 'Maria Silva',
    email: 'maria@example.com',
    phone: '+5511912345678',
    answers: ANSWERS,
    ipAddress: '203.0.113.10',
    retentionMonths: 6,
    correlationId: CORRELATION_ID,
    ...overrides,
  };
}

describe('LeadFormSubmission', () => {
  describe('create()', () => {
    it('creates a submission with correct properties', () => {
      const before = new Date();
      const submission = LeadFormSubmission.create(baseParams());
      const after = new Date();

      expect(submission.id).toBeDefined();
      expect(submission.tenantId).toBe(TENANT_ID);
      expect(submission.customerId).toBeNull();
      expect(submission.name).toBe('Maria Silva');
      expect(submission.email.address).toBe('maria@example.com');
      expect(submission.phone.value).toBe('+5511912345678');
      expect(submission.answers).toEqual(ANSWERS);
      expect(submission.ipAddress).toBe('203.0.113.10');
      expect(submission.submittedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(submission.submittedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('sets customerId when the submitter was authenticated', () => {
      const submission = LeadFormSubmission.create(baseParams({ customerId: CUSTOMER_ID }));
      expect(submission.customerId).toBe(CUSTOMER_ID);
    });

    it('trims the name', () => {
      const submission = LeadFormSubmission.create(baseParams({ name: '  Maria Silva  ' }));
      expect(submission.name).toBe('Maria Silva');
    });

    it('throws LeadFormSubmissionNameRequiredError for an empty name', () => {
      expect(() => LeadFormSubmission.create(baseParams({ name: '' }))).toThrow(
        LeadFormSubmissionNameRequiredError,
      );
    });

    it('throws LeadFormSubmissionNameRequiredError for a whitespace-only name', () => {
      expect(() => LeadFormSubmission.create(baseParams({ name: '   ' }))).toThrow(
        LeadFormSubmissionNameRequiredError,
      );
    });

    it('reuses Email.FORMAT_INVALID for an invalid email — no bespoke code', () => {
      expect(() => LeadFormSubmission.create(baseParams({ email: 'not-an-email' }))).toThrow(
        EmailValidationError,
      );
      try {
        LeadFormSubmission.create(baseParams({ email: 'not-an-email' }));
      } catch (err) {
        expect((err as EmailValidationError).code).toBe(EmailErrorCode.FORMAT_INVALID);
      }
    });

    it('reuses PhoneNumber.FORMAT_INVALID for an invalid phone — no bespoke code', () => {
      expect(() => LeadFormSubmission.create(baseParams({ phone: '12345' }))).toThrow(
        PhoneNumberValidationError,
      );
      try {
        LeadFormSubmission.create(baseParams({ phone: '12345' }));
      } catch (err) {
        expect((err as PhoneNumberValidationError).code).toBe(PhoneErrorCode.FORMAT_INVALID);
      }
    });

    it('snapshots the full answers array as given, never a live lookup', () => {
      const submission = LeadFormSubmission.create(baseParams());
      expect(submission.answers).toEqual(ANSWERS);
      // Returned array is a defensive copy — mutating it must not affect the aggregate's state.
      submission.answers.push({
        questionId: 'q2',
        questionLabel: 'injected',
        questionType: 'TEXT',
        answerValue: 'x',
      });
      expect(submission.answers).toHaveLength(1);
    });

    it('computes expiresAt from the given retentionMonths, correct for each call independently', () => {
      const submissionA = LeadFormSubmission.create(baseParams({ retentionMonths: 6 }));
      const submissionB = LeadFormSubmission.create(baseParams({ retentionMonths: 12 }));

      const diffA =
        submissionA.expiresAt.getUTCMonth() -
        submissionA.submittedAt.getUTCMonth() +
        12 * (submissionA.expiresAt.getUTCFullYear() - submissionA.submittedAt.getUTCFullYear());
      const diffB =
        submissionB.expiresAt.getUTCMonth() -
        submissionB.submittedAt.getUTCMonth() +
        12 * (submissionB.expiresAt.getUTCFullYear() - submissionB.submittedAt.getUTCFullYear());

      expect(diffA).toBe(6);
      expect(diffB).toBe(12);
      // A change in retentionMonths between two calls produces two genuinely different
      // expiresAt values — never recomputed from a shared/stale reading.
      expect(submissionA.expiresAt.getTime()).not.toBe(submissionB.expiresAt.getTime());
    });

    it('publishes LeadFormSubmissionReceived with submissionId sourced from the aggregate id', () => {
      const submission = LeadFormSubmission.create(baseParams({ customerId: CUSTOMER_ID }));
      const events = submission.domainEvents;
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(LeadFormSubmissionReceived);
      expect(events[0].tenantId).toBe(TENANT_ID);
      expect(events[0].correlationId).toBe(CORRELATION_ID);
      expect((events[0] as LeadFormSubmissionReceived).data).toEqual({
        submissionId: submission.id,
        customerId: CUSTOMER_ID,
      });
    });

    it('publishes customerId: null for an unauthenticated (guest) submission', () => {
      const submission = LeadFormSubmission.create(baseParams({ customerId: null }));
      expect((submission.domainEvents[0] as LeadFormSubmissionReceived).data.customerId).toBeNull();
    });
  });

  describe('reconstitute()', () => {
    it('reconstructs the aggregate without validation and without events', () => {
      const submission = new LeadFormSubmissionBuilder()
        .withTenantId(TENANT_ID)
        .withName('Reconstituted Lead')
        .build();

      expect(submission.tenantId).toBe(TENANT_ID);
      expect(submission.name).toBe('Reconstituted Lead');
      expect(submission.clearDomainEvents()).toHaveLength(0);
    });
  });
});
