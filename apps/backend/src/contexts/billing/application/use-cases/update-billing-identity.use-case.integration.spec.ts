import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { TypeOrmTransactionManager } from '../../../../shared/infrastructure/typeorm-transaction-manager';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import {
  BillingAccountEntityBuilder,
  SubscriptionEntityBuilder,
} from '../../../../test/builders/billing';
import { createTestDataSource } from '../../../../test/test-datasource';
import { waitForParkedBehind } from '../../../../test/utils/booking-lock-race-world';
import { BillingAccountEntity } from '../../infrastructure/entities/billing-account.entity';
import { SubscriptionEntity } from '../../infrastructure/entities/subscription.entity';
import { TypeOrmBillingAccountRepository } from '../../infrastructure/repositories/typeorm-billing-account.repository';
import { BillingIdentityTaxIdInvalidError } from '../../domain/errors/billing-domain.error';
import { GetBillingIdentityUseCase } from './get-billing-identity.use-case';
import { UpdateBillingIdentityUseCase } from './update-billing-identity.use-case';

const CPF = '52998224725';
const ADDRESS = {
  street: 'Rua A',
  number: '1',
  neighborhood: 'Centro',
  city: 'Belo Horizonte',
  state: 'MG',
  zipCode: '30130-110',
};

// The real account repository, the row lock (B-I1, docs/LOCK_CATALOG.md) and the whole-row save
// against Postgres, composed by hand like the other Billing job suites. The HTTP surface is the
// controller integration spec's.
describe('UpdateBillingIdentityUseCase (integration, UC-118)', () => {
  let ds: DataSource;
  let accounts: TypeOrmBillingAccountRepository;
  let txManager: TypeOrmTransactionManager;
  let update: UpdateBillingIdentityUseCase;
  let read: GetBillingIdentityUseCase;
  const tenants: string[] = [];

  // A BR account with a subscription row (the account's country is read from it).
  const seed = async (
    configure: (b: BillingAccountEntityBuilder) => BillingAccountEntityBuilder = (b) => b,
    options: { exempt?: boolean; countryCode?: string } = {},
  ): Promise<string> => {
    const tenantId = uuidv7();
    tenants.push(tenantId);
    await ds.getRepository(SubscriptionEntity).insert(
      new SubscriptionEntityBuilder()
        .withTenantId(tenantId)
        .withCountryCode(options.countryCode ?? 'BR')
        .withExempt(options.exempt ?? false)
        .build(),
    );
    await ds
      .getRepository(BillingAccountEntity)
      .insert(configure(new BillingAccountEntityBuilder().withTenantId(tenantId)).build());
    return tenantId;
  };

  const row = (tenantId: string) =>
    ds.getRepository(BillingAccountEntity).findOneByOrFail({ tenantId });

  beforeAll(async () => {
    ds = await createTestDataSource();
    txManager = new TypeOrmTransactionManager(ds);
    accounts = new TypeOrmBillingAccountRepository(ds.getRepository(BillingAccountEntity));
    update = new UpdateBillingIdentityUseCase(accounts, txManager);
    read = new GetBillingIdentityUseCase(accounts);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    if (tenants.length > 0) {
      for (const table of ['billing_accounts', 'subscriptions']) {
        await ds.query(`DELETE FROM "billing"."${table}" WHERE "tenant_id" = ANY($1::uuid[])`, [
          tenants,
        ]);
      }
      tenants.length = 0;
    }
  });

  afterAll(async () => {
    await ds.destroy();
  });

  it('saves and reads back the identity: the columns hold the normalised values', async () => {
    const tenantId = await seed();

    await update.execute({
      tenantId,
      taxId: '529.982.247-25',
      legalName: 'Acme Ltda',
      billingEmail: 'Billing@Acme.test',
      address: ADDRESS,
    });

    expect(await read.execute({ tenantId })).toEqual({
      provisioning: false,
      taxIdType: 'CPF',
      taxId: CPF,
      legalName: 'Acme Ltda',
      billingEmail: 'billing@acme.test',
      address: { ...ADDRESS, complement: null },
    });
    expect(await row(tenantId)).toMatchObject({ taxIdType: 'CPF', taxId: CPF });
  });

  it('supplies a missing BR tax id, and keeps the stored one when an empty value is sent', async () => {
    const tenantId = await seed();
    await update.execute({ tenantId, taxId: CPF });

    await expect(update.execute({ tenantId, taxId: '' })).rejects.toBeInstanceOf(
      BillingIdentityTaxIdInvalidError,
    );

    expect(await row(tenantId)).toMatchObject({ taxIdType: 'CPF', taxId: CPF });
  });

  it('lets an exempt account with no tax id save an identity without one', async () => {
    const tenantId = await seed((b) => b, { exempt: true });

    await update.execute({ tenantId, legalName: 'Free Co', address: ADDRESS });

    expect(await row(tenantId)).toMatchObject({ taxId: null, legalName: 'Free Co' });
  });

  it('accepts an alphanumeric CNPJ with valid check digits and refuses bad ones', async () => {
    const tenantId = await seed();

    await update.execute({ tenantId, taxId: '12.ABC.345/01DE-35', taxIdType: 'CNPJ' });
    await expect(
      update.execute({ tenantId, taxId: '12ABC34501DE36', taxIdType: 'CNPJ' }),
    ).rejects.toBeInstanceOf(BillingIdentityTaxIdInvalidError);

    expect(await row(tenantId)).toMatchObject({ taxIdType: 'CNPJ', taxId: '12ABC34501DE35' });
  });

  it('stores a US account’s optional id by the US rules, and clears it', async () => {
    const tenantId = await seed((b) => b, { countryCode: 'US' });

    await update.execute({ tenantId, taxId: '12-3456789' });
    expect(await row(tenantId)).toMatchObject({ taxIdType: 'EIN', taxId: '123456789' });

    await update.execute({ tenantId, taxId: null });
    expect(await row(tenantId)).toMatchObject({ taxIdType: null, taxId: null });
  });

  it('never touches another tenant’s account, byte for byte', async () => {
    const mine = await seed((b) => b.withTaxId('CPF', CPF).withLegalName('Mine'));
    const theirs = await seed((b) => b.withTaxId('CPF', '11144477735').withLegalName('Theirs'));
    const before = await row(theirs);

    await update.execute({ tenantId: mine, legalName: 'Mine, changed', address: ADDRESS });

    expect(await row(theirs)).toEqual(before);
    expect(await read.execute({ tenantId: theirs })).toMatchObject({ legalName: 'Theirs' });
    expect(await read.execute({ tenantId: mine })).toMatchObject({ legalName: 'Mine, changed' });
  });

  it('answers provisioning on a read, and a refusal on a save, for a tenant with no account', async () => {
    const tenantId = uuidv7();

    await expect(read.execute({ tenantId })).resolves.toEqual({ provisioning: true });
    await expect(update.execute({ tenantId, legalName: 'x' })).rejects.toMatchObject({
      code: 'BILLING_PROVISIONING',
    });
  });

  describe('B-I1: the account row lock (docs/LOCK_CATALOG.md)', () => {
    // Runs `first` and parks it inside its own transaction, after its read and before its commit, so
    // the row lock (when it takes one) is held until the returned `release()`.
    const parkInsideSave = async (
      first: () => Promise<unknown>,
    ): Promise<{ holderPid: number; release: () => Promise<void> }> => {
      let release!: () => void;
      let reportPid!: (pid: number) => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      const pid = new Promise<number>((resolve) => (reportPid = resolve));
      const realSave = accounts.save.bind(accounts);
      jest.spyOn(accounts, 'save').mockImplementationOnce(async (account) => {
        const manager = getActiveEntityManager();
        if (!manager) throw new Error('save must run inside the use case’s transaction');
        const [{ pid: holder }] = await manager.query<{ pid: number }[]>(
          'SELECT pg_backend_pid() AS pid',
        );
        reportPid(holder);
        await gate;
        await realSave(account);
      });
      const running = first();
      return {
        holderPid: await pid,
        release: async () => {
          release();
          await running;
        },
      };
    };

    it('a provider customer stored meanwhile is not overwritten by the identity save', async () => {
      const tenantId = await seed();
      const holder = await parkInsideSave(() =>
        update.execute({ tenantId, billingEmail: 'billing@acme.test' }),
      );

      // The issue job's own column-scoped statement (S05) arrives while the save is in flight.
      const assigning = accounts.assignProviderCustomer(tenantId, 'ASAAS', 'cus_123');
      try {
        await waitForParkedBehind(ds, holder.holderPid);
      } finally {
        // Never leave the holder's transaction open, even when the parking assertion fails: the
        // cleanup would block on the locked row instead of reporting the failure.
        await holder.release();
        await assigning.catch(() => undefined);
      }
      await expect(assigning).resolves.toBe(true);

      expect(await row(tenantId)).toMatchObject({
        billingEmail: 'billing@acme.test',
        provider: 'ASAAS',
        providerCustomerId: 'cus_123',
      });
    });

    it('two concurrent partial saves both survive: the second reads what the first committed', async () => {
      const tenantId = await seed();
      const holder = await parkInsideSave(() =>
        update.execute({ tenantId, billingEmail: 'billing@acme.test' }),
      );

      const second = update.execute({ tenantId, legalName: 'Acme Ltda' });
      try {
        await waitForParkedBehind(ds, holder.holderPid);
      } finally {
        await holder.release();
        await second.catch(() => undefined);
      }
      await second;

      expect(await row(tenantId)).toMatchObject({
        billingEmail: 'billing@acme.test',
        legalName: 'Acme Ltda',
      });
    });

    it('refuses the locking read outside a transaction', async () => {
      await expect(accounts.findByTenantIdForUpdate(uuidv7())).rejects.toThrow(
        'must be called inside an active transaction',
      );
    });
  });
});
