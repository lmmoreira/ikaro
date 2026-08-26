import { InMemoryLeadFormSubmissionRepository } from '../../../../test/repositories/platform/in-memory-lead-form-submission.repository';
import { LeadFormSubmissionBuilder } from '../../../../test/builders/platform/lead-form-submission.builder';
import { ListLeadFormSubmissionsUseCase } from './list-lead-form-submissions.use-case';

const TENANT_ID = '01234567-0000-7000-8000-000000000001';
const OTHER_TENANT_ID = '01234567-0000-7000-8000-000000000002';

describe('ListLeadFormSubmissionsUseCase', () => {
  let submissionRepo: InMemoryLeadFormSubmissionRepository;
  let useCase: ListLeadFormSubmissionsUseCase;

  beforeEach(() => {
    submissionRepo = new InMemoryLeadFormSubmissionRepository();
    useCase = new ListLeadFormSubmissionsUseCase(submissionRepo);
  });

  it('paginates correctly across a >1-page fixture, ordered submittedAt DESC', async () => {
    for (let i = 0; i < 25; i++) {
      await submissionRepo.save(
        new LeadFormSubmissionBuilder()
          .withTenantId(TENANT_ID)
          .withName(`Lead ${i}`)
          .withSubmittedAt(new Date(2026, 0, 1 + i))
          .build(),
      );
    }

    const page1 = await useCase.execute({ tenantId: TENANT_ID, page: 1, pageSize: 20 });
    expect(page1.items).toHaveLength(20);
    expect(page1.total).toBe(25);
    expect(page1.page).toBe(1);
    expect(page1.pageSize).toBe(20);
    expect(page1.items[0].name).toBe('Lead 24');
    expect(page1.items[19].name).toBe('Lead 5');

    const page2 = await useCase.execute({ tenantId: TENANT_ID, page: 2, pageSize: 20 });
    expect(page2.items).toHaveLength(5);
    expect(page2.total).toBe(25);
    expect(page2.items[0].name).toBe('Lead 4');
  });

  it('maps each item to id/name/email/phone/submittedAt only', async () => {
    const submission = new LeadFormSubmissionBuilder()
      .withTenantId(TENANT_ID)
      .withName('Maria Silva')
      .withEmail('maria@example.com')
      .withPhone('+5511912345678')
      .build();
    await submissionRepo.save(submission);

    const result = await useCase.execute({ tenantId: TENANT_ID, page: 1, pageSize: 20 });

    expect(result.items).toEqual([
      {
        id: submission.id,
        name: 'Maria Silva',
        email: 'maria@example.com',
        phone: '+5511912345678',
        submittedAt: submission.submittedAt.toISOString(),
      },
    ]);
  });

  it('breaks a submittedAt tie deterministically by id DESC (Codex review finding, PR #428 round 2)', async () => {
    const tiedAt = new Date('2026-01-01T12:00:00.000Z');
    await submissionRepo.save(
      new LeadFormSubmissionBuilder()
        .withId('01234567-0000-7000-8000-000000000001')
        .withTenantId(TENANT_ID)
        .withName('Tied A')
        .withSubmittedAt(tiedAt)
        .build(),
    );
    await submissionRepo.save(
      new LeadFormSubmissionBuilder()
        .withId('01234567-0000-7000-8000-000000000002')
        .withTenantId(TENANT_ID)
        .withName('Tied B')
        .withSubmittedAt(tiedAt)
        .build(),
    );

    const result = await useCase.execute({ tenantId: TENANT_ID, page: 1, pageSize: 20 });

    expect(result.items.map((i) => i.name)).toEqual(['Tied B', 'Tied A']);
  });

  it("tenant isolation — never returns tenant A's submissions when listing as tenant B", async () => {
    await submissionRepo.save(new LeadFormSubmissionBuilder().withTenantId(TENANT_ID).build());

    const result = await useCase.execute({ tenantId: OTHER_TENANT_ID, page: 1, pageSize: 20 });

    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});
