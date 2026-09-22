import { InMemoryLeadFormSubmissionRepository } from '../../../../test/repositories/platform/in-memory-lead-form-submission.repository';
import { LeadFormSubmissionBuilder } from '../../../../test/builders/platform/lead-form-submission.builder';
import { GetLeadFormFilterOptionsUseCase } from './get-lead-form-filter-options.use-case';

const TENANT_ID = '01234567-0000-7000-8000-000000000001';
const OTHER_TENANT_ID = '01234567-0000-7000-8000-000000000002';

describe('GetLeadFormFilterOptionsUseCase', () => {
  let submissionRepo: InMemoryLeadFormSubmissionRepository;
  let useCase: GetLeadFormFilterOptionsUseCase;

  beforeEach(() => {
    submissionRepo = new InMemoryLeadFormSubmissionRepository();
    useCase = new GetLeadFormFilterOptionsUseCase(submissionRepo);
  });

  it('returns the distinct question labels for the tenant', async () => {
    await submissionRepo.save(
      new LeadFormSubmissionBuilder()
        .withTenantId(TENANT_ID)
        .withAnswers([
          {
            questionId: '01234567-0000-7000-8000-000000000101',
            questionLabel: 'Estado civil',
            questionType: 'TEXT',
            answerValue: 'Casado',
          },
        ])
        .build(),
    );

    const result = await useCase.execute({ tenantId: TENANT_ID });

    expect(result).toEqual({ questionLabels: ['Estado civil'] });
  });

  it('returns an empty array when the tenant has no submissions', async () => {
    const result = await useCase.execute({ tenantId: TENANT_ID });

    expect(result).toEqual({ questionLabels: [] });
  });

  it("tenant isolation — never returns another tenant's labels", async () => {
    await submissionRepo.save(
      new LeadFormSubmissionBuilder()
        .withTenantId(OTHER_TENANT_ID)
        .withAnswers([
          {
            questionId: '01234567-0000-7000-8000-000000000101',
            questionLabel: 'Other Tenant Label',
            questionType: 'TEXT',
            answerValue: 'x',
          },
        ])
        .build(),
    );

    const result = await useCase.execute({ tenantId: TENANT_ID });

    expect(result).toEqual({ questionLabels: [] });
  });
});
