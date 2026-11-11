import { EntityManager, Repository } from 'typeorm';
import { runWithEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { TaxId } from '../../../../shared/value-objects/tax-id.vo';
import { SignupRegistrationBuilder } from '../../../../test/builders/billing';
import { SignupRegistrationEntity } from '../entities/signup-registration.entity';
import { TypeOrmSignupRegistrationRepository } from './typeorm-signup-registration.repository';
import {
  signupRegistrationToDomain,
  signupRegistrationToEntity,
} from './typeorm-signup-registration.mapper';

// A minimal EntityManager that answers `query()` with canned rows and records `insert()`.
function fakeManager(rows: unknown[] = []): {
  manager: EntityManager;
  inserted: unknown[];
  queries: Array<{ sql: string; params: unknown[] }>;
} {
  const inserted: unknown[] = [];
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
  } as unknown as EntityManager;
  return { manager, inserted, queries };
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
});
