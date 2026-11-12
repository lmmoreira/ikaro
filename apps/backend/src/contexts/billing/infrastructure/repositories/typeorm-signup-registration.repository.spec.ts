import { EntityManager, Repository } from 'typeorm';
import { runWithEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { TaxId } from '../../../../shared/value-objects/tax-id.vo';
import { SignupRegistrationBuilder } from '../../../../test/builders/billing';
import { SignupRegistrationNotAvailableError } from '../../domain/errors/billing-domain.error';
import { SignupRegistrationEntity } from '../entities/signup-registration.entity';
import { TypeOrmSignupRegistrationRepository } from './typeorm-signup-registration.repository';
import {
  signupRegistrationToDomain,
  signupRegistrationToEntity,
} from './typeorm-signup-registration.mapper';

// A minimal EntityManager that answers `query()` with canned rows and records `insert()`.
function fakeManager(
  rows: unknown[] = [],
  options: { found?: SignupRegistrationEntity | null; affected?: number } = {},
): {
  manager: EntityManager;
  inserted: unknown[];
  queries: Array<{ sql: string; params: unknown[] }>;
  updates: Array<{ set: unknown; where: string; params: unknown }>;
} {
  const inserted: unknown[] = [];
  const updates: Array<{ set: unknown; where: string; params: unknown }> = [];
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const manager = {
    query: (sql: string, params: unknown[]) => {
      queries.push({ sql, params });
      return Promise.resolve(rows);
    },
    insert: (_entity: unknown, value: unknown) => {
      inserted.push(value);
      return Promise.resolve();
    },
    findOne: () => Promise.resolve(options.found ?? null),
    createQueryBuilder: () => {
      const update = { set: undefined as unknown, where: '', params: undefined as unknown };
      const builder = {
        update: () => builder,
        set: (value: unknown) => {
          update.set = value;
          return builder;
        },
        where: (clause: string, params: unknown) => {
          update.where = clause;
          update.params = params;
          return builder;
        },
        execute: () => {
          updates.push(update);
          return Promise.resolve({ affected: options.affected ?? 1 });
        },
      };
      return builder;
    },
  } as unknown as EntityManager;
  return { manager, inserted, queries, updates };
}

describe('signup registration mapper', () => {
  it('round-trips a SELF_SIGNUP registration with its tax id and terms', () => {
    const registration = new SignupRegistrationBuilder()
      .withGoogleSub('sub-1')
      .withTaxId(TaxId.reconstitute('52998224725', 'CPF'))
      .build();

    const entity = signupRegistrationToEntity(registration);
    const back = signupRegistrationToDomain(entity);

    expect(entity).toMatchObject({
      id: registration.id,
      tenantId: null,
      source: 'SELF_SIGNUP',
      status: 'RESERVED',
      googleSub: 'sub-1',
      taxIdType: 'CPF',
      taxId: '52998224725',
      termsVersion: registration.terms?.version,
    });
    expect(back).toEqual(registration);
  });

  it('maps an OPERATOR registration with no tax id, Google sub or terms to NULL columns', () => {
    const registration = new SignupRegistrationBuilder().asOperator().build();

    const entity = signupRegistrationToEntity(registration);

    expect(entity).toMatchObject({
      source: 'OPERATOR',
      googleSub: null,
      taxId: null,
      taxIdType: null,
      termsVersion: null,
      termsAcceptedAt: null,
    });
    expect(signupRegistrationToDomain(entity).terms).toBeNull();
  });
});

describe('TypeOrmSignupRegistrationRepository', () => {
  const repo = new TypeOrmSignupRegistrationRepository(
    {} as unknown as Repository<SignupRegistrationEntity>,
  );

  it('maps the history rows, passing the Google sub as the only parameter', async () => {
    const { manager, queries } = fakeManager([
      { status: 'COMPLETED', has_ever_paid: true },
      { status: 'RESERVED', has_ever_paid: false },
    ]);

    const history = await runWithEntityManager(manager, () => repo.findGoogleSubHistory('sub-1'));

    expect(history).toEqual([
      { status: 'COMPLETED', hasEverPaid: true },
      { status: 'RESERVED', hasEverPaid: false },
    ]);
    expect(queries[0].params).toEqual(['sub-1']);
    expect(queries[0].sql).toContain("r.source = 'SELF_SIGNUP'");
  });

  it.each([
    [[{ held: true }], true],
    [[{ held: false }], false],
    [[], false],
  ])('reads the tax-id holder flag from %j', async (rows, expected) => {
    const { manager, queries } = fakeManager(rows);

    const held = await runWithEntityManager(manager, () => repo.isTaxIdHeldByUnpaid('52998224725'));

    expect(held).toBe(expected);
    expect(queries[0].params).toEqual(['52998224725']);
  });

  it('inserts the registration through the active manager', async () => {
    const { manager, inserted } = fakeManager();
    const registration = new SignupRegistrationBuilder().build();

    await runWithEntityManager(manager, () => repo.save(registration));

    expect(inserted).toEqual([signupRegistrationToEntity(registration)]);
  });

  it('finds a registration by id, or null when none exists', async () => {
    const registration = new SignupRegistrationBuilder().build();
    const found = fakeManager([], { found: signupRegistrationToEntity(registration) });
    const missing = fakeManager([], { found: null });

    await expect(
      runWithEntityManager(found.manager, () => repo.findById(registration.id)),
    ).resolves.toEqual(registration);
    await expect(
      runWithEntityManager(missing.manager, () => repo.findById('nope')),
    ).resolves.toBeNull();
  });

  it('completes with one conditional UPDATE that only matches a RESERVED row and clears the tax id', async () => {
    const tenantId = 'aaaaaaaa-0000-4000-8000-000000000001';
    const completed = new SignupRegistrationBuilder()
      .withTaxId(TaxId.reconstitute('52998224725', 'CPF'))
      .build()
      .complete(tenantId);
    const { manager, updates } = fakeManager();

    await runWithEntityManager(manager, () => repo.complete(completed));

    expect(updates).toEqual([
      {
        set: { tenantId, status: 'COMPLETED', taxIdType: null, taxId: null },
        where: 'id = :id AND status = :reserved',
        params: { id: completed.id, reserved: 'RESERVED' },
      },
    ]);
  });

  it('refuses to complete when the conditional UPDATE matches no row (already COMPLETED or unknown)', async () => {
    const completed = new SignupRegistrationBuilder()
      .build()
      .complete('aaaaaaaa-0000-4000-8000-000000000001');
    const { manager } = fakeManager([], { affected: 0 });

    await expect(runWithEntityManager(manager, () => repo.complete(completed))).rejects.toThrow(
      SignupRegistrationNotAvailableError,
    );
  });
});
