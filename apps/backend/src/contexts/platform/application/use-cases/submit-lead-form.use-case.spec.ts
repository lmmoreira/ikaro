import { makeLeadFormQuestion } from '../../../../test/builders/platform/lead-form-config.builder';
import {
  LeadFormAnswerQuestionInvalidError,
  LeadFormAnswerRequiredError,
  LeadFormCustomerOnlyError,
} from '../../domain/errors/lead-form-domain.error';
import { CreateLeadFormSubmissionUseCase } from './create-lead-form-submission.use-case';
import {
  GetLeadFormPublicConfigUseCase,
  GetLeadFormPublicConfigUseCaseResult,
} from './get-lead-form-public-config.use-case';
import { SubmitLeadFormUseCase, SubmitLeadFormUseCaseInput } from './submit-lead-form.use-case';

const TENANT_ID = '01234567-0000-7000-8000-000000000001';
const QUESTION_ID = '01234567-0000-7000-8000-000000000101';
const UNKNOWN_QUESTION_ID = '01234567-0000-7000-8000-000000009999';

function baseInput(
  overrides: Partial<SubmitLeadFormUseCaseInput> = {},
): SubmitLeadFormUseCaseInput {
  return {
    tenantId: TENANT_ID,
    customerId: null,
    name: 'Maria Silva',
    email: 'maria.silva@example.com',
    phone: '+5511987654321',
    answers: [{ questionId: QUESTION_ID, value: 'Lavagem completa' }],
    ipAddress: '203.0.113.10',
    correlationId: 'corr-1',
    ...overrides,
  };
}

function makeGetConfig(result: GetLeadFormPublicConfigUseCaseResult) {
  return {
    execute: jest.fn().mockResolvedValue(result),
  } as unknown as GetLeadFormPublicConfigUseCase;
}

function makeCreateSubmission() {
  return {
    execute: jest.fn().mockResolvedValue({ submissionId: 'submission-uuid' }),
  } as unknown as CreateLeadFormSubmissionUseCase;
}

describe('SubmitLeadFormUseCase', () => {
  it('re-checks the live config via GetLeadFormPublicConfigUseCase (propagates LeadFormNotEnabledError if disabled)', async () => {
    const error = new Error('not enabled');
    const getConfig = {
      execute: jest.fn().mockRejectedValue(error),
    } as unknown as GetLeadFormPublicConfigUseCase;
    const createSubmission = makeCreateSubmission();
    const useCase = new SubmitLeadFormUseCase(getConfig, createSubmission);

    await expect(useCase.execute(baseInput())).rejects.toThrow(error);
    expect(createSubmission.execute).not.toHaveBeenCalled();
  });

  it('throws LeadFormCustomerOnlyError when audienceMode is CUSTOMER_ONLY and customerId is null', async () => {
    const getConfig = makeGetConfig({
      audienceMode: 'CUSTOMER_ONLY',
      questions: [makeLeadFormQuestion({ id: QUESTION_ID })],
    });
    const createSubmission = makeCreateSubmission();
    const useCase = new SubmitLeadFormUseCase(getConfig, createSubmission);

    await expect(useCase.execute(baseInput({ customerId: null }))).rejects.toThrow(
      LeadFormCustomerOnlyError,
    );
    expect(createSubmission.execute).not.toHaveBeenCalled();
  });

  it('succeeds when audienceMode is CUSTOMER_ONLY and customerId is present', async () => {
    const getConfig = makeGetConfig({
      audienceMode: 'CUSTOMER_ONLY',
      questions: [makeLeadFormQuestion({ id: QUESTION_ID, required: false })],
    });
    const createSubmission = makeCreateSubmission();
    const useCase = new SubmitLeadFormUseCase(getConfig, createSubmission);

    const result = await useCase.execute(baseInput({ customerId: 'customer-uuid' }));

    expect(result).toEqual({ submissionId: 'submission-uuid' });
    expect(createSubmission.execute).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'customer-uuid' }),
    );
  });

  it('enriches each answer with questionLabel/questionType from the live catalog, never trusting client-supplied values', async () => {
    const catalogQuestion = makeLeadFormQuestion({
      id: QUESTION_ID,
      label: 'Server label',
      type: 'TEXT',
      required: false,
    });
    const getConfig = makeGetConfig({
      audienceMode: 'GUEST_AND_CUSTOMER',
      questions: [catalogQuestion],
    });
    const createSubmission = makeCreateSubmission();
    const useCase = new SubmitLeadFormUseCase(getConfig, createSubmission);

    await useCase.execute(
      baseInput({ answers: [{ questionId: QUESTION_ID, value: 'Lavagem completa' }] }),
    );

    expect(createSubmission.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        answers: [
          {
            questionId: QUESTION_ID,
            questionLabel: 'Server label',
            questionType: 'TEXT',
            answerValue: 'Lavagem completa',
          },
        ],
      }),
    );
  });

  it('rejects the whole submission with LeadFormAnswerQuestionInvalidError when an answer references an unknown questionId', async () => {
    const getConfig = makeGetConfig({
      audienceMode: 'GUEST_AND_CUSTOMER',
      questions: [makeLeadFormQuestion({ id: QUESTION_ID, required: false })],
    });
    const createSubmission = makeCreateSubmission();
    const useCase = new SubmitLeadFormUseCase(getConfig, createSubmission);

    await expect(
      useCase.execute(baseInput({ answers: [{ questionId: UNKNOWN_QUESTION_ID, value: 'x' }] })),
    ).rejects.toThrow(LeadFormAnswerQuestionInvalidError);
    expect(createSubmission.execute).not.toHaveBeenCalled();
  });

  it('throws LeadFormAnswerRequiredError when a required question has no matching answer', async () => {
    const requiredQuestion = makeLeadFormQuestion({ id: QUESTION_ID, required: true });
    const getConfig = makeGetConfig({
      audienceMode: 'GUEST_AND_CUSTOMER',
      questions: [requiredQuestion],
    });
    const createSubmission = makeCreateSubmission();
    const useCase = new SubmitLeadFormUseCase(getConfig, createSubmission);

    await expect(useCase.execute(baseInput({ answers: [] }))).rejects.toThrow(
      LeadFormAnswerRequiredError,
    );
    expect(createSubmission.execute).not.toHaveBeenCalled();
  });

  it('throws LeadFormAnswerRequiredError when a required question has only an empty-string answer', async () => {
    const requiredQuestion = makeLeadFormQuestion({ id: QUESTION_ID, required: true });
    const getConfig = makeGetConfig({
      audienceMode: 'GUEST_AND_CUSTOMER',
      questions: [requiredQuestion],
    });
    const createSubmission = makeCreateSubmission();
    const useCase = new SubmitLeadFormUseCase(getConfig, createSubmission);

    await expect(
      useCase.execute(baseInput({ answers: [{ questionId: QUESTION_ID, value: '   ' }] })),
    ).rejects.toThrow(LeadFormAnswerRequiredError);
  });

  it('accepts a non-required question left unanswered', async () => {
    const optionalQuestion = makeLeadFormQuestion({ id: QUESTION_ID, required: false });
    const getConfig = makeGetConfig({
      audienceMode: 'GUEST_AND_CUSTOMER',
      questions: [optionalQuestion],
    });
    const createSubmission = makeCreateSubmission();
    const useCase = new SubmitLeadFormUseCase(getConfig, createSubmission);

    const result = await useCase.execute(baseInput({ answers: [] }));

    expect(result).toEqual({ submissionId: 'submission-uuid' });
  });

  it('delegates to CreateLeadFormSubmissionUseCase with tenantId/name/email/phone/ipAddress/correlationId passed through unchanged', async () => {
    const getConfig = makeGetConfig({ audienceMode: 'GUEST_AND_CUSTOMER', questions: [] });
    const createSubmission = makeCreateSubmission();
    const useCase = new SubmitLeadFormUseCase(getConfig, createSubmission);
    const input = baseInput({ answers: [] });

    await useCase.execute(input);

    expect(createSubmission.execute).toHaveBeenCalledWith({
      tenantId: input.tenantId,
      customerId: input.customerId,
      name: input.name,
      email: input.email,
      phone: input.phone,
      answers: [],
      ipAddress: input.ipAddress,
      correlationId: input.correlationId,
    });
  });
});
