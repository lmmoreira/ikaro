import { EntityManager, QueryFailedError, Repository } from 'typeorm';
import { Email } from '../../../../shared/value-objects/email.vo';
import { TaxId } from '../../../../shared/value-objects/tax-id.vo';
import { BillingAccount } from '../../domain/billing-account.aggregate';
import {
  BillingAccountAlreadyExistsError,
  BillingAccountSubscriptionMissingError,
} from '../../domain/errors/billing-domain.error';
import {
  BillingAccountBuilder,
  BillingAccountEntityBuilder,
  SubscriptionEntityBuilder,
} from '../../../../test/builders/billing';
import { BillingAccountEntity } from '../entities/billing-account.entity';
import { SubscriptionEntity } from '../entities/subscription.entity';
import { TypeOrmBillingAccountRepository } from './typeorm-billing-account.repository';

const TENANT = '0197a2b0-0000-7000-8000-0000000000bb';

describe('TypeOrmBillingAccountRepository', () => {
  let manager: jest.Mocked<EntityManager>;
  let repo: TypeOrmBillingAccountRepository;

  beforeEach(() => {
    manager = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      insert: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<EntityManager>;
    repo = new TypeOrmBillingAccountRepository({
      manager,
    } as unknown as Repository<BillingAccountEntity>);
  });

  describe('findByTenantId', () => {
    it('maps the row and takes the country from the tenant subscription, filtering by tenant', async () => {
      const row = new BillingAccountEntityBuilder()
        .withTenantId(TENANT)
        .withTaxId('CPF', '52998224725')
        .withLegalName('Lava Rápido Ltda')
        .withBillingEmail('financeiro@example.com')
        .withProvider('ASAAS', 'cus_123')
        .withTerms('2026-11', new Date('2026-11-10T12:00:00Z'), 'gerente@example.com')
        .withAddress({
          street: 'Rua A',
          number: '10',
          city: 'São Paulo',
          state: 'SP',
          zipCode: '01310-100',
        })
        .build();
      manager.findOne.mockImplementation((entity: unknown) =>
        Promise.resolve(
          entity === BillingAccountEntity
            ? row
            : Object.assign(new SubscriptionEntityBuilder().withTenantId(TENANT).build(), {
                countryCode: 'US',
              }),
        ),
      );

      const account = await repo.findByTenantId(TENANT);

      expect(account).toBeInstanceOf(BillingAccount);
      expect(account?.countryCode.value).toBe('US');
      expect(account?.taxId?.type).toBe('CPF');
      expect(account?.legalName).toBe('Lava Rápido Ltda');
      expect(account?.billingEmail?.address).toBe('financeiro@example.com');
      expect(account?.provider).toBe('ASAAS');
      expect(account?.providerCustomerId).toBe('cus_123');
      expect(account?.acceptedTerms).toEqual({
        version: '2026-11',
        acceptedAt: new Date('2026-11-10T12:00:00Z'),
        acceptedBy: 'gerente@example.com',
      });
      expect(account?.address?.city).toBe('São Paulo');
      expect(manager.findOne).toHaveBeenCalledWith(BillingAccountEntity, {
        where: { tenantId: TENANT },
      });
      expect(manager.findOne).toHaveBeenCalledWith(SubscriptionEntity, {
        where: { tenantId: TENANT },
        select: { id: true, countryCode: true },
      });
    });

    it('loads an exempt shell with no tax id, terms or address', async () => {
      manager.findOne.mockImplementation((entity: unknown) =>
        Promise.resolve(
          entity === BillingAccountEntity
            ? new BillingAccountEntityBuilder().withTenantId(TENANT).build()
            : new SubscriptionEntityBuilder().withTenantId(TENANT).build(),
        ),
      );

      const account = await repo.findByTenantId(TENANT);

      expect(account?.taxId).toBeNull();
      expect(account?.acceptedTerms).toBeNull();
      expect(account?.address).toBeNull();
      expect(account?.billingEmail).toBeNull();
      expect(account?.countryCode.value).toBe('BR');
    });

    it('returns null without reading the subscription when the tenant has no account', async () => {
      manager.findOne.mockResolvedValue(null);

      expect(await repo.findByTenantId(TENANT)).toBeNull();
      expect(manager.findOne).toHaveBeenCalledTimes(1);
    });

    it('fails loudly when the account has no subscription to take its country from', async () => {
      manager.findOne.mockImplementation((entity: unknown) =>
        Promise.resolve(
          entity === BillingAccountEntity ? new BillingAccountEntityBuilder().build() : null,
        ),
      );

      await expect(repo.findByTenantId(TENANT)).rejects.toThrow(
        BillingAccountSubscriptionMissingError,
      );
    });
  });

  describe('save', () => {
    it("updates the tenant's own row by (id, tenant_id) and writes neither the country nor the identity", async () => {
      const account = new BillingAccountBuilder()
        .withTenantId(TENANT)
        .withCountryCode('US')
        .withTaxId('52998224725', 'CPF')
        .withBillingEmail('financeiro@example.com')
        .build();

      await repo.save(account);

      const [target, criteria, changes] = manager.update.mock.calls[0]!;
      expect(target).toBe(BillingAccountEntity);
      expect(criteria).toEqual({ id: account.id, tenantId: TENANT });
      expect(changes).toMatchObject({
        taxIdType: 'CPF',
        taxId: '52998224725',
        billingEmail: 'financeiro@example.com',
        autoBilling: 'NONE',
        autoBillingStatus: 'INACTIVE',
      });
      for (const fixed of ['id', 'tenantId', 'countryCode', 'createdAt']) {
        expect(changes).not.toHaveProperty(fixed);
      }
      expect(manager.insert).not.toHaveBeenCalled();
    });

    it('inserts when no row of that tenant matched, without the country', async () => {
      manager.update.mockResolvedValueOnce({ affected: 0, raw: [], generatedMaps: [] });
      const account = new BillingAccountBuilder()
        .withTenantId(TENANT)
        .withCountryCode('US')
        .build();

      await repo.save(account);

      const [target, entity] = manager.insert.mock.calls[0]!;
      expect(target).toBe(BillingAccountEntity);
      expect(entity).toMatchObject({
        id: account.id,
        tenantId: TENANT,
        taxId: null,
        taxIdType: null,
      });
      expect(entity).not.toHaveProperty('countryCode');
    });

    it('never touches another tenant: an id that belongs elsewhere finds no row to update and fails the insert', async () => {
      manager.update.mockResolvedValueOnce({ affected: 0, raw: [], generatedMaps: [] });
      const primaryKeyViolation = new QueryFailedError(
        'INSERT',
        [],
        Object.assign(new Error('duplicate key'), {
          code: '23505',
          constraint: 'PK_billing_billing_accounts',
        }),
      );
      manager.insert.mockRejectedValueOnce(primaryKeyViolation);

      await expect(
        repo.save(new BillingAccountBuilder().withTenantId(TENANT).build()),
      ).rejects.toBe(primaryKeyViolation);
    });

    it('turns a second account for one tenant (UNIQUE(tenant_id)) into BillingAccountAlreadyExistsError', async () => {
      manager.update.mockResolvedValueOnce({ affected: 0, raw: [], generatedMaps: [] });
      manager.insert.mockRejectedValueOnce(
        new QueryFailedError(
          'INSERT',
          [],
          Object.assign(new Error('duplicate key'), {
            code: '23505',
            constraint: 'UQ_billing_billing_accounts_tenant',
          }),
        ),
      );

      await expect(
        repo.save(new BillingAccountBuilder().withTenantId(TENANT).build()),
      ).rejects.toThrow(BillingAccountAlreadyExistsError);
    });

    it('rethrows any other insert failure unchanged', async () => {
      manager.update.mockResolvedValueOnce({ affected: 0, raw: [], generatedMaps: [] });
      const boom = new Error('connection lost');
      manager.insert.mockRejectedValueOnce(boom);

      await expect(
        repo.save(new BillingAccountBuilder().withTenantId(TENANT).build()),
      ).rejects.toBe(boom);
    });

    it('writes null columns for an account with no tax id, address or terms', async () => {
      await repo.save(new BillingAccountBuilder().withTenantId(TENANT).build());

      const [, , changes] = manager.update.mock.calls[0]!;
      expect(changes).toMatchObject({
        taxId: null,
        taxIdType: null,
        address: null,
        termsVersion: null,
      });
    });

    it('round-trips a tax id, provider and auto-billing fields through the entity shape', async () => {
      const account = new BillingAccountBuilder().withTenantId(TENANT).build();
      const withExtras = BillingAccount.reconstitute({
        id: account.id,
        tenantId: account.tenantId,
        countryCode: account.countryCode,
        taxId: TaxId.reconstitute('11222333000181', 'CNPJ'),
        legalName: 'X',
        billingEmail: Email.reconstitute('a@b.co'),
        address: null,
        provider: 'STRIPE',
        providerCustomerId: 'cus_9',
        autoBilling: 'PIX_AUTOMATICO',
        autoBillingStatus: 'ACTIVE',
        autoBillingLabel: 'Pix',
        acceptedTerms: null,
      });

      await repo.save(withExtras);

      const [, , changes] = manager.update.mock.calls[0]!;
      expect(changes).toMatchObject({
        taxIdType: 'CNPJ',
        taxId: '11222333000181',
        provider: 'STRIPE',
        providerCustomerId: 'cus_9',
        autoBilling: 'PIX_AUTOMATICO',
        autoBillingStatus: 'ACTIVE',
        autoBillingLabel: 'Pix',
      });
    });
  });
});
