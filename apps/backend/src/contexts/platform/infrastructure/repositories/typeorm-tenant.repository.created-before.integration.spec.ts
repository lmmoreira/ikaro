import { DataSource } from 'typeorm';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { TenantBuilder } from '../../../../test/builders/platform';
import { createTestDataSource } from '../../../../test/test-datasource';
import { ListTenantsCreatedBeforeUseCase } from '../../application/use-cases/list-tenants-created-before.use-case';
import { TenantEntity } from '../entities/tenant.entity';
import { buildTenantsCreatedBeforeQuery } from './typeorm-tenant.age-query';
import { CachingTenantRepository } from './caching-tenant.repository';
import { TypeOrmTenantRepository } from './typeorm-tenant.repository';
import { InMemoryCachePort } from '../../../../test/infrastructure/in-memory-cache.port';

interface PlanNode {
  'Node Type': string;
  'Index Name'?: string;
  Plans?: PlanNode[];
}
const collectNodes = (node: PlanNode): PlanNode[] => [
  node,
  ...(node.Plans ?? []).flatMap(collectNodes),
];

// The listing selects across every tenant in the (shared) database, so this spec seeds its own
// tenants in a window of the year 2001, long before any other suite's rows, and asks only for that
// window (a cutoff in mid-2001): no other suite's tenant can ever fall inside it.
const WINDOW_START = new Date('2001-01-01T00:00:00Z');
const at = (days: number): Date => new Date(WINDOW_START.getTime() + days * 86_400_000);
const CUTOFF = at(100);

describe('TypeOrmTenantRepository.findCreatedBefore (integration, UC-140)', () => {
  let ds: DataSource;
  let typeOrmRepo: TypeOrmTenantRepository;
  let useCase: ListTenantsCreatedBeforeUseCase;
  const ids: string[] = [];

  const seed = async (slug: string, createdAt: Date, isActive = true): Promise<string> => {
    const tenant = new TenantBuilder()
      .withSlug(`cb-${slug}-${Math.random().toString(36).slice(2, 8)}`)
      .withCreatedAt(createdAt)
      .withIsActive(isActive)
      .build();
    await typeOrmRepo.save(tenant);
    ids.push(tenant.id);
    return tenant.id;
  };

  beforeAll(async () => {
    ds = await createTestDataSource();
    typeOrmRepo = new TypeOrmTenantRepository(
      ds.getRepository(TenantEntity),
      new InMemoryEventBus(),
    );
    // The use case over the same repository the module wires: the caching decorator.
    useCase = new ListTenantsCreatedBeforeUseCase(
      new CachingTenantRepository(typeOrmRepo, new InMemoryCachePort()),
    );
  });

  afterAll(async () => {
    if (ids.length > 0) {
      await ds.query(`DELETE FROM "platform"."tenants" WHERE "id" = ANY($1::uuid[])`, [ids]);
    }
    await ds.destroy();
  });

  it('pages by keyset, oldest first: with a page smaller than the count every tenant is reached exactly once, ties included', async () => {
    const sameInstant = at(10);
    const seeded = [
      await seed('a', sameInstant),
      await seed('b', sameInstant),
      await seed('c', sameInstant),
      await seed('d', at(20)),
      await seed('e', at(30)),
    ];
    // Created after the cutoff: never listed.
    await seed('late', at(200));

    const reached: string[] = [];
    let after: { createdAt: Date; id: string } | undefined;
    for (let pages = 0; pages < 10; pages += 1) {
      const page = await useCase.execute({ cutoff: CUTOFF, limit: 2, after });
      if (page.length === 0) break;
      reached.push(...page.map((row) => row.tenantId));
      const last = page[page.length - 1];
      after = { createdAt: last.createdAt, id: last.tenantId };
    }

    expect([...reached].sort()).toEqual([...seeded].sort());
    expect(new Set(reached).size).toBe(reached.length);
    // The order is (created_at, id): the three tied rows come in id order, then d, then e.
    expect(reached.slice(0, 3)).toEqual([...reached.slice(0, 3)].sort());
    expect(reached.slice(3)).toEqual([seeded[3], seeded[4]]);
  });

  it('returns exactly the six documented fields, includes an inactive tenant and never a billing table', async () => {
    const inactive = await seed('inactive', at(40), false);

    const rows = await useCase.execute({ cutoff: CUTOFF, limit: 50 });
    const row = rows.find((candidate) => candidate.tenantId === inactive);

    expect(row).toBeDefined();
    expect(Object.keys(row!).sort()).toEqual(
      ['countryCode', 'createdAt', 'isActive', 'slug', 'tenantId', 'timezone'].sort(),
    );
    expect(row!.isActive).toBe(false);
    const [sql] = buildTenantsCreatedBeforeQuery(
      ds.getRepository(TenantEntity),
      CUTOFF,
      10,
    ).getQueryAndParameters();
    expect(sql).not.toMatch(/billing/i);
  });

  it('serves the listing from the standalone created_at index', async () => {
    const [sql, parameters] = buildTenantsCreatedBeforeQuery(
      ds.getRepository(TenantEntity),
      CUTOFF,
      10,
      { createdAt: at(10), id: '00000000-0000-7000-8000-000000000000' },
    ).getQueryAndParameters();
    const runner = ds.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      // A near-empty table makes the planner's choice meaningless, so sequential scans are off for
      // this transaction (rolled back): the plan must then name the index.
      await runner.query('SET LOCAL enable_seqscan = off');
      const [{ 'QUERY PLAN': plan }] = await runner.query(
        `EXPLAIN (FORMAT JSON) ${sql}`,
        parameters,
      );
      const nodes = collectNodes(plan[0].Plan as PlanNode);

      expect(nodes.map((node) => node['Index Name'])).toContain('IDX_platform_tenants_created_at');
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });
});
