import { DataSource, Repository } from 'typeorm';
import { TenantEntityBuilder } from '../../../../test/builders/platform/tenant-entity.builder';
import { makeConfigService } from '../../../../test/infrastructure/fake-config-service';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryInboxRepository } from '../../../../test/infrastructure/in-memory-inbox.repository';
import { createTestDataSource } from '../../../../test/test-datasource';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { OutboxEventEntity } from '../../../../shared/infrastructure/outbox/outbox-event.entity';
import { OutboxPublisher } from '../../../../shared/infrastructure/outbox/outbox-publisher';
import { OutboxRelayService } from '../../../../shared/infrastructure/outbox/outbox-relay.service';
import { TypeOrmOutboxRepository } from '../../../../shared/infrastructure/outbox/typeorm-outbox.repository';
import { TypeOrmTransactionManager } from '../../../../shared/infrastructure/typeorm-transaction-manager';
import { localDayBoundsUTC } from '../../../../shared/utils/calendar-date';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { LeadFormSubmissionBuilder } from '../../../../test/builders/platform/lead-form-submission.builder';
import { LeadFormSubmissionEntityBuilder } from '../../../../test/builders/platform/lead-form-submission-entity.builder';
import { LeadFormSubmission } from '../../domain/lead-form-submission.aggregate';
import { TenantEntity } from '../entities/tenant.entity';
import { LeadFormSubmissionEntity } from '../entities/lead-form-submission.entity';
import { TypeOrmLeadFormSubmissionRepository } from './typeorm-lead-form-submission.repository';

// TD24-S02 pattern — LeadFormSubmission is the 4th aggregate to join the transactional-outbox
// pattern (after Booking/Staff/Tenant), mirroring
// typeorm-booking.repository.outbox-cutover.integration.spec.ts's own cutover coverage.
describe('TypeOrmLeadFormSubmissionRepository (integration)', () => {
  let dataSource: DataSource;
  let entityRepo: Repository<LeadFormSubmissionEntity>;
  let outboxRepo: Repository<OutboxEventEntity>;
  let typeOrmOutboxRepo: TypeOrmOutboxRepository;
  let txManager: TypeOrmTransactionManager;
  const TENANT_A = uuidv7();
  const TENANT_B = uuidv7();
  // question_id is a UUID column (matches every question's real id, client-generated via
  // crypto.randomUUID() on the admin panel) — not an arbitrary string.
  const QUESTION_ID = uuidv7();
  const OTHER_QUESTION_ID = uuidv7();

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    entityRepo = dataSource.getRepository(LeadFormSubmissionEntity);
    outboxRepo = dataSource.getRepository(OutboxEventEntity);
    typeOrmOutboxRepo = new TypeOrmOutboxRepository(outboxRepo);
    txManager = new TypeOrmTransactionManager(dataSource);

    const tenantRepo = dataSource.getRepository(TenantEntity);
    await tenantRepo.save(
      new TenantEntityBuilder().withId(TENANT_A).withSlug(`lead-form-tenant-a-${TENANT_A}`).build(),
    );
    await tenantRepo.save(
      new TenantEntityBuilder().withId(TENANT_B).withSlug(`lead-form-tenant-b-${TENANT_B}`).build(),
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await entityRepo.delete({ tenantId: TENANT_A });
    await entityRepo.delete({ tenantId: TENANT_B });
    await outboxRepo.delete({ tenantId: TENANT_A });
    await outboxRepo.delete({ tenantId: TENANT_B });
  });

  function makeRepo(eventBus: InMemoryEventBus, inlineDispatchEnabled = false) {
    const config = makeConfigService({ OUTBOX_INLINE_DISPATCH_ENABLED: inlineDispatchEnabled });
    const relay = new OutboxRelayService(
      typeOrmOutboxRepo,
      eventBus,
      new InMemoryInboxRepository(),
      config,
      txManager,
    );
    const outboxPublisher = new OutboxPublisher(typeOrmOutboxRepo, relay, config);
    return new TypeOrmLeadFormSubmissionRepository(entityRepo, outboxPublisher);
  }

  function buildSubmission(tenantId: string, overrides: Partial<{ ipAddress: string }> = {}) {
    return LeadFormSubmission.create({
      tenantId,
      customerId: null,
      name: 'Maria Silva',
      email: `lead-${uuidv7()}@example.com`,
      phone: '+5511912345678',
      answers: [
        {
          questionId: QUESTION_ID,
          questionLabel: 'Origem',
          questionType: 'TEXT',
          answerValue: 'Google',
        },
      ],
      ipAddress: overrides.ipAddress ?? '203.0.113.10',
      retentionMonths: 6,
      correlationId: `corr-${uuidv7()}`,
    });
  }

  it('creates and retrieves a submission — all fields survive the round-trip', async () => {
    const repo = makeRepo(new InMemoryEventBus());
    const submission = buildSubmission(TENANT_A);

    await txManager.run(() => repo.save(submission));

    const found = await entityRepo.findOne({ where: { id: submission.id } });
    expect(found).not.toBeNull();
    expect(found!.tenantId).toBe(TENANT_A);
    expect(found!.name).toBe('Maria Silva');
    expect(found!.email).toBe(submission.email.address);
    expect(found!.phone).toBe('+5511912345678');
    expect(found!.answers).toEqual(submission.answers);
    expect(found!.ipAddress).toBe('203.0.113.10');
    expect(found!.customerId).toBeNull();
    await expect(
      dataSource.query(
        `
          SELECT question_id FROM platform.lead_form_submission_question_refs
          WHERE tenant_id = $1 AND submission_id = $2
        `,
        [TENANT_A, submission.id],
      ),
    ).resolves.toEqual([{ question_id: QUESTION_ID }]);
  });

  it('looks up submitted question IDs through the tenant-scoped reference index', async () => {
    const repo = makeRepo(new InMemoryEventBus());
    await txManager.run(() => repo.save(buildSubmission(TENANT_A)));
    await txManager.run(() => repo.save(buildSubmission(TENANT_B)));

    await expect(
      repo.findQuestionIdsWithSubmissions(TENANT_A, [QUESTION_ID, OTHER_QUESTION_ID]),
    ).resolves.toEqual([QUESTION_ID]);
    await expect(
      repo.findQuestionIdsWithSubmissions(TENANT_A, [OTHER_QUESTION_ID]),
    ).resolves.toEqual([]);
  });

  it('drains the domain event into shared.outbox in the same transaction as the insert', async () => {
    const eventBus = new InMemoryEventBus();
    const repo = makeRepo(eventBus);
    const submission = buildSubmission(TENANT_A);
    const pendingEventId = submission.domainEvents[0].eventId;

    await txManager.run(() => repo.save(submission));

    const outboxRow = await outboxRepo.findOne({ where: { id: pendingEventId } });
    expect(outboxRow).not.toBeNull();
    expect(outboxRow!.tenantId).toBe(TENANT_A);
    expect(outboxRow!.eventName).toBe('LeadFormSubmissionReceived');

    const savedRow = await entityRepo.findOne({ where: { id: submission.id } });
    expect(savedRow).not.toBeNull();
  });

  it('rolls back the outbox row together with the business write when the outer transaction throws', async () => {
    const eventBus = new InMemoryEventBus();
    const repo = makeRepo(eventBus);
    const submission = buildSubmission(TENANT_A);
    const pendingEventId = submission.domainEvents[0].eventId;

    await expect(
      txManager.run(async () => {
        await repo.save(submission);
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');

    expect(await entityRepo.findOne({ where: { id: submission.id } })).toBeNull();
    expect(await outboxRepo.findOne({ where: { id: pendingEventId } })).toBeNull();
  });

  it('uses the ambient EntityManager to join an already-open transaction (no nested transaction)', async () => {
    const eventBus = new InMemoryEventBus();
    const repo = makeRepo(eventBus);
    const submission = buildSubmission(TENANT_A);

    await txManager.run(async () => {
      expect(getActiveEntityManager()).toBeDefined();
      await repo.save(submission);
    });

    expect(await entityRepo.findOne({ where: { id: submission.id } })).not.toBeNull();
  });

  it('creates a real UNIQUE (tenant_id, id) constraint on lead_form_submissions — required as S12/lead_form_answers own future composite FK target', async () => {
    const rows = (await dataSource.query(
      `
        SELECT kcu.column_name, kcu.ordinal_position
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = 'platform'
          AND tc.table_name = 'lead_form_submissions'
          AND tc.constraint_type = 'UNIQUE'
        ORDER BY kcu.ordinal_position
      `,
    )) as Array<{ column_name: string; ordinal_position: number }>;

    expect(rows.map((r) => r.column_name)).toEqual(['tenant_id', 'id']);
  });

  // Migration 1748500000004's own backfill INSERT — proves it actually catches a submission that
  // predates this migration (e.g. written by the already-shipped M20-S02/S05/S06 public submission
  // endpoint before this table existed), the exact gap a round of review caught this migration
  // shipping without (Codex review finding, M20-S08 PR #429, 2026-08-26).
  it("backfills a pre-existing submission's question refs, matching the migration's own INSERT", async () => {
    // Bypasses TypeOrmLeadFormSubmissionRepository.save() entirely (a raw entity insert, like
    // LeadFormSubmissionEntityBuilder's other call sites) — persistQuestionRefs() never runs, so
    // this simulates a submission that already existed when the migration's backfill last ran.
    const preExisting = new LeadFormSubmissionEntityBuilder()
      .withTenantId(TENANT_A)
      .withAnswers([
        {
          questionId: QUESTION_ID,
          questionLabel: 'Origem',
          questionType: 'TEXT',
          answerValue: 'Indicação',
        },
      ])
      .build();
    await entityRepo.save(preExisting);

    await expect(
      dataSource.query(
        `SELECT question_id FROM platform.lead_form_submission_question_refs WHERE submission_id = $1`,
        [preExisting.id],
      ),
    ).resolves.toEqual([]);

    // Same statement as the migration's own up() — kept in sync deliberately, not imported,
    // since a migration file must stay a frozen historical record of what actually ran.
    await dataSource.query(`
      INSERT INTO "platform"."lead_form_submission_question_refs"
        ("tenant_id", "submission_id", "question_id")
      SELECT submission."tenant_id", submission."id", (answer ->> 'questionId')::uuid
      FROM "platform"."lead_form_submissions" AS submission
      CROSS JOIN LATERAL jsonb_array_elements(submission."answers") AS answer
      WHERE answer ? 'questionId' AND answer ->> 'questionId' IS NOT NULL
      ON CONFLICT DO NOTHING
    `);

    await expect(
      dataSource.query(
        `SELECT question_id FROM platform.lead_form_submission_question_refs WHERE submission_id = $1`,
        [preExisting.id],
      ),
    ).resolves.toEqual([{ question_id: QUESTION_ID }]);
  });

  describe('countByTenantAndDate / countByTenantIpAndDate — tenant isolation (CLAUDE.md §2)', () => {
    it('Tenant B submissions never count against Tenant A cap, and vice versa', async () => {
      const repo = makeRepo(new InMemoryEventBus());
      const { start, end } = localDayBoundsUTC(new Date(), 'UTC');
      const sharedIp = '198.51.100.20';

      await txManager.run(() => repo.save(buildSubmission(TENANT_A, { ipAddress: sharedIp })));
      await txManager.run(() => repo.save(buildSubmission(TENANT_A, { ipAddress: sharedIp })));
      await txManager.run(() => repo.save(buildSubmission(TENANT_B, { ipAddress: sharedIp })));

      const countA = await repo.countByTenantAndDate(TENANT_A, start, end);
      const countB = await repo.countByTenantAndDate(TENANT_B, start, end);
      expect(countA).toBe(2);
      expect(countB).toBe(1);

      const ipCountA = await repo.countByTenantIpAndDate(TENANT_A, sharedIp, start, end);
      const ipCountB = await repo.countByTenantIpAndDate(TENANT_B, sharedIp, start, end);
      expect(ipCountA).toBe(2);
      expect(ipCountB).toBe(1);
    });

    it('countByTenantAndDate only counts rows submitted within the given instant range', async () => {
      const repo = makeRepo(new InMemoryEventBus());
      const submission = buildSubmission(TENANT_A);
      await txManager.run(() => repo.save(submission));

      const { start: todayStart, end: todayEnd } = localDayBoundsUTC(new Date(), 'UTC');
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const { start: yesterdayStart, end: yesterdayEnd } = localDayBoundsUTC(yesterday, 'UTC');

      const countYesterday = await repo.countByTenantAndDate(
        TENANT_A,
        yesterdayStart,
        yesterdayEnd,
      );
      const countToday = await repo.countByTenantAndDate(TENANT_A, todayStart, todayEnd);

      expect(countYesterday).toBe(0);
      expect(countToday).toBe(1);
    });

    it('correctly buckets a submission near local midnight for a non-UTC tenant, against a real Postgres timestamptz column (PR #417 review finding)', async () => {
      const repo = makeRepo(new InMemoryEventBus());
      // 2026-08-25T01:00:00Z is 2026-08-24T22:00:00 local (America/Sao_Paulo, UTC-3) — still local
      // Aug 24. A bare UTC-day window for the same instant would NOT contain it — the exact bug
      // localDayBoundsUTC()/the use case's own real-instant-boundaries fix closes.
      const submittedAt = new Date('2026-08-25T01:00:00.000Z');
      const submission = new LeadFormSubmissionBuilder()
        .withTenantId(TENANT_A)
        .withSubmittedAt(submittedAt)
        .build();
      await txManager.run(() => repo.save(submission));

      const localBounds = localDayBoundsUTC(submittedAt, 'America/Sao_Paulo');
      const countLocalDay = await repo.countByTenantAndDate(
        TENANT_A,
        localBounds.start,
        localBounds.end,
      );
      expect(countLocalDay).toBe(1);

      // The old (buggy) implementation resolved the *local* date string ("2026-08-24") and then
      // queried a bare UTC-day window for that same literal string (2026-08-24T00:00:00Z through
      // 2026-08-24T23:59:59.999Z) — which does NOT contain this instant (2026-08-25T01:00:00Z),
      // so the old logic would have silently missed this submission when checking the local-day
      // cap. Asserting against that exact window proves this specific bug class is closed.
      const oldBuggyUtcDayBounds = {
        start: new Date('2026-08-24T00:00:00.000Z'),
        end: new Date('2026-08-24T23:59:59.999Z'),
      };
      const countUnderOldBuggyLogic = await repo.countByTenantAndDate(
        TENANT_A,
        oldBuggyUtcDayBounds.start,
        oldBuggyUtcDayBounds.end,
      );
      expect(countUnderOldBuggyLogic).toBe(0);
    });
  });

  describe('findByTenantPaginated / findById (M20-S06)', () => {
    it('paginates real rows ordered submittedAt DESC and round-trips email/phone via reconstitute', async () => {
      const repo = makeRepo(new InMemoryEventBus());
      for (let i = 0; i < 3; i++) {
        await txManager.run(() =>
          repo.save(
            new LeadFormSubmissionBuilder()
              .withTenantId(TENANT_A)
              .withName(`Lead ${i}`)
              .withSubmittedAt(new Date(Date.UTC(2026, 0, 1, 0, 0, i)))
              .build(),
          ),
        );
      }

      const page1 = await repo.findByTenantPaginated(TENANT_A, 1, 2);
      expect(page1.total).toBe(3);
      expect(page1.items).toHaveLength(2);
      expect(page1.items[0].name).toBe('Lead 2');
      expect(page1.items[0].email.address).toBe('lead@example.com');
      expect(page1.items[0].phone.value).toBe('+5511912345678');

      const page2 = await repo.findByTenantPaginated(TENANT_A, 2, 2);
      expect(page2.items).toHaveLength(1);
      expect(page2.items[0].name).toBe('Lead 0');
    });

    it('breaks a submittedAt tie deterministically by id DESC, keeping page boundaries stable across fetches (CodeRabbit review finding, PR #428)', async () => {
      const repo = makeRepo(new InMemoryEventBus());
      const tiedAt = new Date(Date.UTC(2026, 0, 1, 12, 0, 0));
      // Two submissions sharing the exact same submittedAt — plausible under concurrent traffic.
      // Without a secondary sort key, a plain ORDER BY submitted_at DESC leaves their relative
      // order across LIMIT/OFFSET undefined by Postgres.
      await txManager.run(() =>
        repo.save(
          new LeadFormSubmissionBuilder()
            .withId('01234567-0000-7000-8000-000000000001')
            .withTenantId(TENANT_A)
            .withName('Tied A')
            .withSubmittedAt(tiedAt)
            .build(),
        ),
      );
      await txManager.run(() =>
        repo.save(
          new LeadFormSubmissionBuilder()
            .withId('01234567-0000-7000-8000-000000000002')
            .withTenantId(TENANT_A)
            .withName('Tied B')
            .withSubmittedAt(tiedAt)
            .build(),
        ),
      );

      // id DESC → the higher UUID ('...002') sorts first.
      const page1 = await repo.findByTenantPaginated(TENANT_A, 1, 1);
      expect(page1.items[0].name).toBe('Tied B');
      const page2 = await repo.findByTenantPaginated(TENANT_A, 2, 1);
      expect(page2.items[0].name).toBe('Tied A');

      // Re-fetching the same pages returns the identical order — no flapping across calls.
      const page1Again = await repo.findByTenantPaginated(TENANT_A, 1, 1);
      expect(page1Again.items[0].name).toBe('Tied B');
    });

    it("findByTenantPaginated never returns another tenant's rows", async () => {
      const repo = makeRepo(new InMemoryEventBus());
      await txManager.run(() => repo.save(buildSubmission(TENANT_A)));
      await txManager.run(() => repo.save(buildSubmission(TENANT_B)));

      const { items, total } = await repo.findByTenantPaginated(TENANT_B, 1, 20);
      expect(total).toBe(1);
      expect(items[0].tenantId).toBe(TENANT_B);
    });

    it('findById returns null for an id belonging to a different tenant', async () => {
      const repo = makeRepo(new InMemoryEventBus());
      const submission = buildSubmission(TENANT_A);
      await txManager.run(() => repo.save(submission));

      expect(await repo.findById(submission.id, TENANT_B)).toBeNull();
      const found = await repo.findById(submission.id, TENANT_A);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(submission.id);
    });
  });
});
