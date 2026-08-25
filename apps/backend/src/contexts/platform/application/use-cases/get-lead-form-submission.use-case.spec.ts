import { InMemoryLeadFormSubmissionRepository } from '../../../../test/repositories/platform/in-memory-lead-form-submission.repository';
import { LeadFormSubmissionBuilder } from '../../../../test/builders/platform/lead-form-submission.builder';
import { LeadFormSubmissionNotFoundError } from '../../domain/errors/lead-form-domain.error';
import { GetLeadFormSubmissionUseCase } from './get-lead-form-submission.use-case';

const TENANT_ID = '01234567-0000-7000-8000-000000000001';
const OTHER_TENANT_ID = '01234567-0000-7000-8000-000000000002';

describe('GetLeadFormSubmissionUseCase', () => {
  let submissionRepo: InMemoryLeadFormSubmissionRepository;
  let useCase: GetLeadFormSubmissionUseCase;

  beforeEach(() => {
    submissionRepo = new InMemoryLeadFormSubmissionRepository();
    useCase = new GetLeadFormSubmissionUseCase(submissionRepo);
  });

  it('throws LeadFormSubmissionNotFoundError for an unknown id', async () => {
    await expect(
      useCase.execute({
        tenantId: TENANT_ID,
        submissionId: '01234567-0000-7000-8000-999999999999',
      }),
    ).rejects.toThrow(LeadFormSubmissionNotFoundError);
  });

  it('tenant isolation — 404s when the submission belongs to a different tenant', async () => {
    const submission = new LeadFormSubmissionBuilder().withTenantId(TENANT_ID).build();
    await submissionRepo.save(submission);

    await expect(
      useCase.execute({ tenantId: OTHER_TENANT_ID, submissionId: submission.id }),
    ).rejects.toThrow(LeadFormSubmissionNotFoundError);
  });

  it('returns the full answers snapshot with questionLabel/questionType/answerValue, ignoring the current config catalog', async () => {
    const submission = new LeadFormSubmissionBuilder()
      .withTenantId(TENANT_ID)
      .withName('Maria Silva')
      .withEmail('maria@example.com')
      .withPhone('+5511912345678')
      .withAnswers([
        {
          questionId: 'q1',
          // Deliberately stale relative to any hypothetical "current" catalog label — proves
          // the detail view renders the submission's own snapshot, never a live lookup
          // (UC-041 A2, docs/02-DOMAIN_MODEL.md § LeadFormSubmission).
          questionLabel: 'Qual seu bairro? (pergunta removida depois)',
          questionType: 'TEXT',
          answerValue: 'Centro',
        },
        {
          questionId: 'q2',
          questionLabel: 'Como conheceu a loja?',
          questionType: 'MULTIPLE_CHOICE',
          answerValue: ['Instagram', 'Indicação'],
        },
      ])
      .build();
    await submissionRepo.save(submission);

    const result = await useCase.execute({ tenantId: TENANT_ID, submissionId: submission.id });

    expect(result).toEqual({
      id: submission.id,
      name: 'Maria Silva',
      email: 'maria@example.com',
      phone: '+5511912345678',
      answers: [
        {
          questionLabel: 'Qual seu bairro? (pergunta removida depois)',
          questionType: 'TEXT',
          answerValue: 'Centro',
        },
        {
          questionLabel: 'Como conheceu a loja?',
          questionType: 'MULTIPLE_CHOICE',
          answerValue: ['Instagram', 'Indicação'],
        },
      ],
      submittedAt: submission.submittedAt.toISOString(),
    });
  });
});
