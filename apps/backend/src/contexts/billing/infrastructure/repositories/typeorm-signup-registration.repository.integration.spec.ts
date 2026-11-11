import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { TaxId } from '../../../../shared/value-objects/tax-id.vo';
import {
  BillingAccountEntityBuilder,
  SignupRegistrationBuilder,
  SignupRegistrationEntityBuilder,
  SubscriptionEntityBuilder,
} from '../../../../test/builders/billing';
import { createTestDataSource } from '../../../../test/test-datasource';
import { BillingAccountEntity } from '../entities/billing-account.entity';
import { SignupRegistrationEntity } from '../entities/signup-registration.entity';
import { SubscriptionEntity } from '../entities/subscription.entity';
import { TypeOrmSignupRegistrationRepository } from './typeorm-signup-registration.repository';

const CPF = '52998224725';

describe('TypeOrmSignupRegistrationRepository (integration)', () => {
  let dataSource: DataSource;
  let repo: TypeOrmSignupRegistrationRepository;
  // A fresh tenant and Google sub per scenario; every row is deleted after each test.
  const tenants: string[] = [];
  const subs: string[] = [];
  const registrationIds: string[] = [];

  const newTenant = (): string => {
    const tenantId = uuidv7();
    tenants.push(tenantId);
    return tenantId;
  };

  const newSub = (): string => {
    const sub = `sub-${uuidv7()}`;
    subs.push(sub);
    return sub;
  };

  const seedRegistration = async (entity: SignupRegistrationEntity): Promise<void> => {
    registrationIds.push(entity.id);
    await dataSource.getRepository(SignupRegistrationEntity).insert(entity);
  };

  const seedSubscription = (tenantId: string, hasEverPaid: boolean): Promise<unknown> =>
    dataSource
      .getRepository(SubscriptionEntity)
      .insert(
        new SubscriptionEntityBuilder().withTenantId(tenantId).withHasEverPaid(hasEverPaid).build(),
      );

  const seedAccount = (tenantId: string, taxId: string): Promise<unknown> =>
    dataSource
      .getRepository(BillingAccountEntity)
      .insert(
        new BillingAccountEntityBuilder().withTenantId(tenantId).withTaxId('CPF', taxId).build(),
      );

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    repo = new TypeOrmSignupRegistrationRepository(
      dataSource.getRepository(SignupRegistrationEntity),
    );
  });

  afterEach(async () => {
    await dataSource.query(
      `DELETE FROM "billing"."signup_registrations" WHERE "id" = ANY($1::uuid[]) OR "google_sub" = ANY($2::text[]) OR "tenant_id" = ANY($3::uuid[]) OR "tax_id" = $4`,
      [registrationIds, subs, tenants, CPF],
    );
    await dataSource.query(
      `DELETE FROM "billing"."billing_accounts" WHERE "tenant_id" = ANY($1::uuid[])`,
      [tenants],
    );
    await dataSource.query(
      `DELETE FROM "billing"."subscriptions" WHERE "tenant_id" = ANY($1::uuid[])`,
      [tenants],
    );
    tenants.length = 0;
    subs.length = 0;
    registrationIds.length = 0;
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  describe('save', () => {
    it('round-trips a SELF_SIGNUP registration with its tax id and terms', async () => {
      const googleSub = newSub();
      const registration = new SignupRegistrationBuilder()
        .withGoogleSub(googleSub)
        .withTaxId(TaxId.reconstitute(CPF, 'CPF'))
        .build();
      registrationIds.push(registration.id);

      await repo.save(registration);

      const row = await dataSource
        .getRepository(SignupRegistrationEntity)
        .findOneByOrFail({ id: registration.id });
      expect(row).toMatchObject({
        status: 'RESERVED',
        source: 'SELF_SIGNUP',
        tenantId: null,
        googleSub,
        taxIdType: 'CPF',
        taxId: CPF,
        termsVersion: registration.terms?.version,
      });
    });

    it('stores an OPERATOR registration with no Google sub and no terms', async () => {
      const registration = new SignupRegistrationBuilder().asOperator().build();
      registrationIds.push(registration.id);

      await repo.save(registration);

      const row = await dataSource
        .getRepository(SignupRegistrationEntity)
        .findOneByOrFail({ id: registration.id });
      expect(row).toMatchObject({
        source: 'OPERATOR',
        googleSub: null,
        termsVersion: null,
        termsAcceptedAt: null,
      });
    });
  });

  describe('findGoogleSubHistory', () => {
    it('is empty for a Google account with no registration', async () => {
      await expect(repo.findGoogleSubHistory(newSub())).resolves.toEqual([]);
    });

    it('reads paid, unpaid, subscription-less and in-flight rows of that sub', async () => {
      const googleSub = newSub();
      const paidTenant = newTenant();
      const unpaidTenant = newTenant();
      const noSubscriptionTenant = newTenant();
      await seedSubscription(paidTenant, true);
      await seedSubscription(unpaidTenant, false);
      for (const entity of [
        new SignupRegistrationEntityBuilder().withGoogleSub(googleSub).completedFor(paidTenant),
        new SignupRegistrationEntityBuilder().withGoogleSub(googleSub).completedFor(unpaidTenant),
        new SignupRegistrationEntityBuilder()
          .withGoogleSub(googleSub)
          .completedFor(noSubscriptionTenant),
        new SignupRegistrationEntityBuilder().withGoogleSub(googleSub),
      ]) {
        await seedRegistration(entity.build());
      }

      const history = await repo.findGoogleSubHistory(googleSub);

      expect(history).toHaveLength(4);
      expect(
        history.filter((entry) => entry.status === 'COMPLETED' && entry.hasEverPaid),
      ).toHaveLength(1);
      expect(
        history.filter((entry) => entry.status === 'COMPLETED' && !entry.hasEverPaid),
      ).toHaveLength(2);
      expect(history.filter((entry) => entry.status === 'RESERVED')).toEqual([
        { status: 'RESERVED', hasEverPaid: false },
      ]);
    });

    it('ignores OPERATOR rows and other Google accounts', async () => {
      const googleSub = newSub();
      await seedRegistration(new SignupRegistrationEntityBuilder().withGoogleSub(newSub()).build());
      await seedRegistration(new SignupRegistrationEntityBuilder().asOperator().build());

      await expect(repo.findGoogleSubHistory(googleSub)).resolves.toEqual([]);
    });

    // Tenant-less by design: a read returns only the status and the paid flag of the asked sub's rows,
    // never another registration's Google sub or tax id.
    it('exposes nothing but the status and the paid flag', async () => {
      const googleSub = newSub();
      await seedRegistration(
        new SignupRegistrationEntityBuilder()
          .withGoogleSub(googleSub)
          .withTaxId('CPF', CPF)
          .build(),
      );

      const [entry] = await repo.findGoogleSubHistory(googleSub);

      expect(Object.keys(entry).sort()).toEqual(['hasEverPaid', 'status']);
    });
  });

  describe('isTaxIdHeldByUnpaid', () => {
    it('is false for a tax id nobody holds', async () => {
      await expect(repo.isTaxIdHeldByUnpaid(CPF)).resolves.toBe(false);
    });

    it('is true when a billing account whose subscription never paid holds it', async () => {
      const tenantId = newTenant();
      await seedSubscription(tenantId, false);
      await seedAccount(tenantId, CPF);

      await expect(repo.isTaxIdHeldByUnpaid(CPF)).resolves.toBe(true);
    });

    it('is false when the holding account paid', async () => {
      const tenantId = newTenant();
      await seedSubscription(tenantId, true);
      await seedAccount(tenantId, CPF);

      await expect(repo.isTaxIdHeldByUnpaid(CPF)).resolves.toBe(false);
    });

    it('is true while an in-flight RESERVED registration holds it, false once COMPLETED', async () => {
      const registration = new SignupRegistrationEntityBuilder().withTaxId('CPF', CPF).build();
      await seedRegistration(registration);
      await expect(repo.isTaxIdHeldByUnpaid(CPF)).resolves.toBe(true);

      await dataSource
        .getRepository(SignupRegistrationEntity)
        .update(
          { id: registration.id },
          { status: 'COMPLETED', taxId: null, taxIdType: null, tenantId: newTenant() },
        );

      await expect(repo.isTaxIdHeldByUnpaid(CPF)).resolves.toBe(false);
    });

    it('reads IDX_billing_billing_accounts_tax_id for the account half', async () => {
      const plan: Array<Record<string, string>> = await dataSource.transaction(async (manager) => {
        await manager.query('SET LOCAL enable_seqscan = off');
        return manager.query(
          `EXPLAIN SELECT 1
             FROM billing.billing_accounts a
             JOIN billing.subscriptions s ON s.tenant_id = a.tenant_id
            WHERE a.tax_id = $1 AND s.has_ever_paid = false`,
          [CPF],
        );
      });

      const text = plan.map((row) => row['QUERY PLAN']).join('\n');
      expect(text).toContain('IDX_billing_billing_accounts_tax_id');
    });
  });
});
