import { GenericErrorCode, PlatformErrorCode } from '@ikaro/types';
import {
  LeadFormDailyCapReachedError,
  LeadFormSubmissionNameRequiredError,
  LeadFormSubmissionNotFoundError,
} from './lead-form-domain.error';

describe('LeadFormSubmissionNameRequiredError', () => {
  it('carries GENERIC_FIELD_REQUIRED with field "name" and is a real Error instance', () => {
    const err = new LeadFormSubmissionNameRequiredError();
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(LeadFormSubmissionNameRequiredError);
    expect(err.name).toBe('LeadFormSubmissionNameRequiredError');
    expect(err.code).toBe(GenericErrorCode.FIELD_REQUIRED);
    expect(err.field).toBe('name');
  });
});

describe('LeadFormDailyCapReachedError', () => {
  it('carries PLATFORM_LEAD_FORM_DAILY_CAP_REACHED and is a real Error instance', () => {
    const err = new LeadFormDailyCapReachedError();
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(LeadFormDailyCapReachedError);
    expect(err.name).toBe('LeadFormDailyCapReachedError');
    expect(err.code).toBe(PlatformErrorCode.LEAD_FORM_DAILY_CAP_REACHED);
  });
});

describe('LeadFormSubmissionNotFoundError', () => {
  it('carries PLATFORM_LEAD_FORM_SUBMISSION_NOT_FOUND and is a real Error instance', () => {
    const err = new LeadFormSubmissionNotFoundError('01234567-0000-7000-8000-000000000099');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(LeadFormSubmissionNotFoundError);
    expect(err.name).toBe('LeadFormSubmissionNotFoundError');
    expect(err.code).toBe(PlatformErrorCode.LEAD_FORM_SUBMISSION_NOT_FOUND);
  });
});
