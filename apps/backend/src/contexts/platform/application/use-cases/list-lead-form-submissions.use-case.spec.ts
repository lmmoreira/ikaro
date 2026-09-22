import { InMemoryLeadFormSubmissionRepository } from '../../../../test/repositories/platform/in-memory-lead-form-submission.repository';
import { InMemoryTenantSettingsPort } from '../../../../test/infrastructure/in-memory-tenant-settings.port';
import { LeadFormSubmissionBuilder } from '../../../../test/builders/platform/lead-form-submission.builder';
import { ListLeadFormSubmissionsUseCase } from './list-lead-form-submissions.use-case';

const TENANT_ID = '01234567-0000-7000-8000-000000000001';
const OTHER_TENANT_ID = '01234567-0000-7000-8000-000000000002';

describe('ListLeadFormSubmissionsUseCase', () => {
  let submissionRepo: InMemoryLeadFormSubmissionRepository;
  let settingsPort: InMemoryTenantSettingsPort;
  let useCase: ListLeadFormSubmissionsUseCase;

  beforeEach(() => {
    submissionRepo = new InMemoryLeadFormSubmissionRepository();
    settingsPort = new InMemoryTenantSettingsPort();
    useCase = new ListLeadFormSubmissionsUseCase(submissionRepo, settingsPort);
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

  it('basic search matches partially/case-insensitively across name/email/question label/answer value', async () => {
    await submissionRepo.save(
      new LeadFormSubmissionBuilder()
        .withTenantId(TENANT_ID)
        .withName('Carlos Souza')
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
    await submissionRepo.save(
      new LeadFormSubmissionBuilder().withTenantId(TENANT_ID).withName('Ana Lima').build(),
    );

    const result = await useCase.execute({
      tenantId: TENANT_ID,
      page: 1,
      pageSize: 20,
      search: 'casado',
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('Carlos Souza');
  });

  it('advanced filters with 2 entries returns only submissions matching both (AND, not OR)', async () => {
    const matchesBoth = new LeadFormSubmissionBuilder()
      .withTenantId(TENANT_ID)
      .withName('Matches Both')
      .withAnswers([
        {
          questionId: '01234567-0000-7000-8000-000000000101',
          questionLabel: 'Estado civil',
          questionType: 'TEXT',
          answerValue: 'Casado',
        },
        {
          questionId: '01234567-0000-7000-8000-000000000102',
          questionLabel: 'Onde mora',
          questionType: 'TEXT',
          answerValue: 'Sao Paulo',
        },
      ])
      .build();
    const matchesOnlyOne = new LeadFormSubmissionBuilder()
      .withTenantId(TENANT_ID)
      .withName('Matches Only One')
      .withAnswers([
        {
          questionId: '01234567-0000-7000-8000-000000000101',
          questionLabel: 'Estado civil',
          questionType: 'TEXT',
          answerValue: 'Casado',
        },
      ])
      .build();
    await submissionRepo.save(matchesBoth);
    await submissionRepo.save(matchesOnlyOne);

    const result = await useCase.execute({
      tenantId: TENANT_ID,
      page: 1,
      pageSize: 20,
      filters: [
        { questionLabel: 'Estado civil', value: 'casado' },
        { questionLabel: 'Onde mora', value: 'paulo' },
      ],
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('Matches Both');
  });

  it('submittedFrom/submittedTo resolve tenant-local calendar-day boundaries to UTC (America/Sao_Paulo, UTC-3)', async () => {
    // Tenant-local Jan 1 00:00 (America/Sao_Paulo, UTC-3) is 2026-01-01T03:00:00Z.
    const justBeforeLocalMidnight = new LeadFormSubmissionBuilder()
      .withTenantId(TENANT_ID)
      .withName('Still Dec 31 local')
      .withSubmittedAt(new Date('2026-01-01T02:59:00.000Z'))
      .build();
    const atLocalMidnight = new LeadFormSubmissionBuilder()
      .withTenantId(TENANT_ID)
      .withName('Exactly Jan 1 local')
      .withSubmittedAt(new Date('2026-01-01T03:00:00.000Z'))
      .build();
    // Tenant-local Jan 2 00:00 is 2026-01-02T03:00:00Z — the exclusive upper bound for
    // submittedTo=2026-01-01.
    const justBeforeNextLocalMidnight = new LeadFormSubmissionBuilder()
      .withTenantId(TENANT_ID)
      .withName('Still Jan 1 local')
      .withSubmittedAt(new Date('2026-01-02T02:59:00.000Z'))
      .build();
    const atNextLocalMidnight = new LeadFormSubmissionBuilder()
      .withTenantId(TENANT_ID)
      .withName('Already Jan 2 local')
      .withSubmittedAt(new Date('2026-01-02T03:00:00.000Z'))
      .build();
    await submissionRepo.save(justBeforeLocalMidnight);
    await submissionRepo.save(atLocalMidnight);
    await submissionRepo.save(justBeforeNextLocalMidnight);
    await submissionRepo.save(atNextLocalMidnight);

    const result = await useCase.execute({
      tenantId: TENANT_ID,
      page: 1,
      pageSize: 20,
      submittedFrom: '2026-01-01',
      submittedTo: '2026-01-01',
    });

    expect(result.items.map((i) => i.name).sort()).toEqual(
      ['Exactly Jan 1 local', 'Still Jan 1 local'].sort(),
    );
  });

  it('submittedFrom/submittedTo combine with search via AND', async () => {
    const inRangeMatch = new LeadFormSubmissionBuilder()
      .withTenantId(TENANT_ID)
      .withName('Carlos Souza')
      .withSubmittedAt(new Date('2026-01-01T12:00:00.000Z'))
      .build();
    const outOfRangeMatch = new LeadFormSubmissionBuilder()
      .withTenantId(TENANT_ID)
      .withName('Carlos Pereira')
      .withSubmittedAt(new Date('2026-02-01T12:00:00.000Z'))
      .build();
    await submissionRepo.save(inRangeMatch);
    await submissionRepo.save(outOfRangeMatch);

    const result = await useCase.execute({
      tenantId: TENANT_ID,
      page: 1,
      pageSize: 20,
      search: 'carlos',
      submittedFrom: '2026-01-01',
      submittedTo: '2026-01-01',
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('Carlos Souza');
  });

  it('omitting search/filters/submittedFrom/submittedTo returns the same result as plain pagination', async () => {
    await submissionRepo.save(new LeadFormSubmissionBuilder().withTenantId(TENANT_ID).build());

    const result = await useCase.execute({ tenantId: TENANT_ID, page: 1, pageSize: 20 });

    expect(result.total).toBe(1);
  });

  it('zero matches returns an empty items array with total 0, never throws', async () => {
    await submissionRepo.save(new LeadFormSubmissionBuilder().withTenantId(TENANT_ID).build());

    const result = await useCase.execute({
      tenantId: TENANT_ID,
      page: 1,
      pageSize: 20,
      search: 'nonexistent',
    });

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('does not call the settings port when no date range is given', async () => {
    const getSettingsSpy = jest.spyOn(settingsPort, 'getSettings');

    await useCase.execute({ tenantId: TENANT_ID, page: 1, pageSize: 20, search: undefined });

    expect(getSettingsSpy).not.toHaveBeenCalled();
  });
});
