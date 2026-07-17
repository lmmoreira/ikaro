import { InMemoryLoyaltyBalanceRepository } from '../../../../test/infrastructure/in-memory-loyalty-balance.repository';
import { InMemoryLoyaltyEntryRepository } from '../../../../test/infrastructure/in-memory-loyalty-entry.repository';
import { InMemoryLoyaltyRedemptionRepository } from '../../../../test/infrastructure/in-memory-loyalty-redemption.repository';
import { InMemoryLoyaltyBookingPort } from '../../../../test/infrastructure/in-memory-loyalty-booking.port';
import { InMemoryLoyaltyCustomerPort } from '../../../../test/infrastructure/in-memory-loyalty-customer.port';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { RequestContextBuilder } from '../../../../test/factories/request-context.factory';
import { TenantSettingsPropsBuilder } from '../../../../test/builders/platform/tenant-settings-props.builder';
import {
  LoyaltyBalanceBuilder,
  LoyaltyEntryBuilder,
  LoyaltyRedemptionBuilder,
} from '../../../../test/builders/loyalty/index';
import { GetLoyaltyBalanceUseCase } from '../../application/use-cases/get-loyalty-balance/get-loyalty-balance.use-case';
import { GetLoyaltyEntriesUseCase } from '../../application/use-cases/get-loyalty-entries/get-loyalty-entries.use-case';
import { GetLoyaltyRedemptionsUseCase } from '../../application/use-cases/get-loyalty-redemptions/get-loyalty-redemptions.use-case';
import { RedeemPointsUseCase } from '../../application/use-cases/redeem-points/redeem-points.use-case';
import { LoyaltyController } from './loyalty.controller';

const TENANT_ID = '10000000-0000-7000-8000-000000000001';
const CUSTOMER_ID = 'aaaaaaaa-0000-7000-8000-000000000001';
const STAFF_ID = 'bbbbbbbb-0000-7000-8000-000000000001';
const SERVICE_ID = 'cccccccc-0000-7000-8000-000000000001';

describe('LoyaltyController', () => {
  let balanceRepo: InMemoryLoyaltyBalanceRepository;
  let entryRepo: InMemoryLoyaltyEntryRepository;
  let redemptionRepo: InMemoryLoyaltyRedemptionRepository;
  let serviceCatalog: InMemoryLoyaltyBookingPort;
  let loyaltyCustomer: InMemoryLoyaltyCustomerPort;
  let txManager: InMemoryTransactionManager;
  let controller: LoyaltyController;

  describe('getBalance() — customer route', () => {
    beforeEach(() => {
      balanceRepo = new InMemoryLoyaltyBalanceRepository();
      txManager = new InMemoryTransactionManager();
      entryRepo = new InMemoryLoyaltyEntryRepository();
      redemptionRepo = new InMemoryLoyaltyRedemptionRepository();
      serviceCatalog = new InMemoryLoyaltyBookingPort();
      loyaltyCustomer = new InMemoryLoyaltyCustomerPort();
      const ctx = new RequestContextBuilder()
        .withTenantId(TENANT_ID)
        .withActorId(CUSTOMER_ID)
        .withActorType('CUSTOMER')
        .withActorRole('CUSTOMER')
        .build();
      controller = new LoyaltyController(
        new GetLoyaltyBalanceUseCase(balanceRepo, entryRepo),
        new GetLoyaltyEntriesUseCase(entryRepo, serviceCatalog),
        new GetLoyaltyRedemptionsUseCase(redemptionRepo, serviceCatalog),
        new RedeemPointsUseCase(balanceRepo, redemptionRepo, txManager),
        ctx,
        loyaltyCustomer,
      );
    });

    it('returns zero balance when customer has no data', async () => {
      const result = await controller.getBalance({});
      expect(result.currentPoints).toBe(0);
      expect(result.nextExpiryDate).toBeNull();
    });

    it('returns currentPoints from balance row', async () => {
      await balanceRepo.upsert(
        new LoyaltyBalanceBuilder()
          .withTenantId(TENANT_ID)
          .withCustomerId(CUSTOMER_ID)
          .withCurrentPoints(100)
          .build(),
      );

      const result = await controller.getBalance({});
      expect(result.currentPoints).toBe(100);
    });

    it('returns conversionRate 0 with default settings (redemption disabled)', async () => {
      const result = await controller.getBalance({});
      expect(result.conversionRate).toBe(0);
    });

    it('returns conversionRate from tenant settings loyalty.pointsPerCurrencyUnit', async () => {
      const ctx = new RequestContextBuilder()
        .withTenantId(TENANT_ID)
        .withActorId(CUSTOMER_ID)
        .withActorType('CUSTOMER')
        .withActorRole('CUSTOMER')
        .withSettings(
          new TenantSettingsPropsBuilder().withLoyalty({ pointsPerCurrencyUnit: 10 }).build(),
        )
        .build();
      const customerController = new LoyaltyController(
        new GetLoyaltyBalanceUseCase(balanceRepo, entryRepo),
        new GetLoyaltyEntriesUseCase(entryRepo, serviceCatalog),
        new GetLoyaltyRedemptionsUseCase(redemptionRepo, serviceCatalog),
        new RedeemPointsUseCase(balanceRepo, redemptionRepo, txManager),
        ctx,
        loyaltyCustomer,
      );

      const result = await customerController.getBalance({});
      expect(result.conversionRate).toBe(10);
    });

    it("resolves the caller's own record in another tenant via ?tenantId (switch-tenant screen)", async () => {
      const OTHER_TENANT = '10000000-0000-7000-8000-000000000002';
      const OTHER_TENANT_CUSTOMER_ID = 'bbbbbbbb-0000-7000-8000-000000000099';
      loyaltyCustomer.seed(CUSTOMER_ID, OTHER_TENANT, OTHER_TENANT_CUSTOMER_ID);
      await balanceRepo.upsert(
        new LoyaltyBalanceBuilder()
          .withTenantId(OTHER_TENANT)
          .withCustomerId(OTHER_TENANT_CUSTOMER_ID)
          .withCurrentPoints(77)
          .build(),
      );

      const result = await controller.getBalance({ tenantId: OTHER_TENANT });
      expect(result.currentPoints).toBe(77);
    });

    it("never reads another customer's balance in the target tenant — resolution is keyed off the caller's own OAuth identity, not a client-suppliable customerId", async () => {
      const OTHER_TENANT = '10000000-0000-7000-8000-000000000002';
      const OTHER_TENANT_CUSTOMER_ID = 'bbbbbbbb-0000-7000-8000-000000000099';
      const SOMEONE_ELSES_CUSTOMER_ID = 'bbbbbbbb-0000-7000-8000-000000000088';
      loyaltyCustomer.seed(CUSTOMER_ID, OTHER_TENANT, OTHER_TENANT_CUSTOMER_ID);
      await balanceRepo.upsert(
        new LoyaltyBalanceBuilder()
          .withTenantId(OTHER_TENANT)
          .withCustomerId(SOMEONE_ELSES_CUSTOMER_ID)
          .withCurrentPoints(999)
          .build(),
      );

      // getBalance() has no customerId param at all — there is nothing a client could
      // supply to redirect the read at SOMEONE_ELSES_CUSTOMER_ID's balance.
      const result = await controller.getBalance({ tenantId: OTHER_TENANT });
      expect(result.currentPoints).toBe(0);
    });

    it('returns conversionRate null for cross-tenant reads (context settings belong to the home tenant)', async () => {
      const OTHER_TENANT = '10000000-0000-7000-8000-000000000002';
      const OTHER_TENANT_CUSTOMER_ID = 'bbbbbbbb-0000-7000-8000-000000000099';
      loyaltyCustomer.seed(CUSTOMER_ID, OTHER_TENANT, OTHER_TENANT_CUSTOMER_ID);

      const result = await controller.getBalance({ tenantId: OTHER_TENANT });
      expect(result.conversionRate).toBeNull();
    });

    it("maps to 404 when the caller has no record in the requested tenant (security regression: cannot read another customer's balance via ?tenantId)", async () => {
      const OTHER_TENANT = '10000000-0000-7000-8000-000000000002';

      let caught: unknown;
      try {
        await controller.getBalance({ tenantId: OTHER_TENANT });
      } catch (err) {
        caught = err;
      }
      expect((caught as { status: number }).status).toBe(404);
    });
  });

  describe('getEntries() — customer route', () => {
    beforeEach(() => {
      balanceRepo = new InMemoryLoyaltyBalanceRepository();
      txManager = new InMemoryTransactionManager();
      entryRepo = new InMemoryLoyaltyEntryRepository();
      redemptionRepo = new InMemoryLoyaltyRedemptionRepository();
      serviceCatalog = new InMemoryLoyaltyBookingPort();
      loyaltyCustomer = new InMemoryLoyaltyCustomerPort();
      const ctx = new RequestContextBuilder()
        .withTenantId(TENANT_ID)
        .withActorId(CUSTOMER_ID)
        .withActorType('CUSTOMER')
        .withActorRole('CUSTOMER')
        .build();
      controller = new LoyaltyController(
        new GetLoyaltyBalanceUseCase(balanceRepo, entryRepo),
        new GetLoyaltyEntriesUseCase(entryRepo, serviceCatalog),
        new GetLoyaltyRedemptionsUseCase(redemptionRepo, serviceCatalog),
        new RedeemPointsUseCase(balanceRepo, redemptionRepo, txManager),
        ctx,
        loyaltyCustomer,
      );
    });

    it('returns empty entries list', async () => {
      const result = await controller.getEntries({ page: 1, limit: 20 });
      expect(result.entries).toHaveLength(0);
    });

    it('resolves serviceName from catalog', async () => {
      serviceCatalog.seed([{ serviceId: SERVICE_ID, serviceName: 'Lavagem Completa' }]);
      await entryRepo.save(
        new LoyaltyEntryBuilder()
          .withTenantId(TENANT_ID)
          .withCustomerId(CUSTOMER_ID)
          .withServiceId(SERVICE_ID)
          .build(),
      );

      const result = await controller.getEntries({ page: 1, limit: 20 });
      expect(result.entries[0].serviceName).toBe('Lavagem Completa');
      expect(result.entries[0].bookingId).toBeDefined();
    });
  });

  describe('getRedemptions() — customer route', () => {
    beforeEach(() => {
      balanceRepo = new InMemoryLoyaltyBalanceRepository();
      txManager = new InMemoryTransactionManager();
      entryRepo = new InMemoryLoyaltyEntryRepository();
      redemptionRepo = new InMemoryLoyaltyRedemptionRepository();
      serviceCatalog = new InMemoryLoyaltyBookingPort();
      loyaltyCustomer = new InMemoryLoyaltyCustomerPort();
      const ctx = new RequestContextBuilder()
        .withTenantId(TENANT_ID)
        .withActorId(CUSTOMER_ID)
        .withActorType('CUSTOMER')
        .withActorRole('CUSTOMER')
        .build();
      controller = new LoyaltyController(
        new GetLoyaltyBalanceUseCase(balanceRepo, entryRepo),
        new GetLoyaltyEntriesUseCase(entryRepo, serviceCatalog),
        new GetLoyaltyRedemptionsUseCase(redemptionRepo, serviceCatalog),
        new RedeemPointsUseCase(balanceRepo, redemptionRepo, txManager),
        ctx,
        loyaltyCustomer,
      );
    });

    it('returns empty redemptions list', async () => {
      const result = await controller.getRedemptions({ page: 1, limit: 20 });
      expect(result.redemptions).toHaveLength(0);
    });

    it('returns customer redemptions', async () => {
      await redemptionRepo.save(
        new LoyaltyRedemptionBuilder()
          .withTenantId(TENANT_ID)
          .withCustomerId(CUSTOMER_ID)
          .withPointsRedeemed(30)
          .build(),
      );

      const result = await controller.getRedemptions({ page: 1, limit: 20 });
      expect(result.redemptions[0].pointsRedeemed).toBe(30);
    });
  });

  describe('getBalanceAdmin() — admin route (STAFF/MANAGER only)', () => {
    beforeEach(() => {
      balanceRepo = new InMemoryLoyaltyBalanceRepository();
      txManager = new InMemoryTransactionManager();
      entryRepo = new InMemoryLoyaltyEntryRepository();
      redemptionRepo = new InMemoryLoyaltyRedemptionRepository();
      serviceCatalog = new InMemoryLoyaltyBookingPort();
      loyaltyCustomer = new InMemoryLoyaltyCustomerPort();
      const ctx = new RequestContextBuilder()
        .withTenantId(TENANT_ID)
        .withActorId(STAFF_ID)
        .withActorType('STAFF')
        .withActorRole('MANAGER')
        .build();
      controller = new LoyaltyController(
        new GetLoyaltyBalanceUseCase(balanceRepo, entryRepo),
        new GetLoyaltyEntriesUseCase(entryRepo, serviceCatalog),
        new GetLoyaltyRedemptionsUseCase(redemptionRepo, serviceCatalog),
        new RedeemPointsUseCase(balanceRepo, redemptionRepo, txManager),
        ctx,
        loyaltyCustomer,
      );
    });

    it('returns zero balance for customer with no data', async () => {
      const result = await controller.getBalanceAdmin(CUSTOMER_ID);
      expect(result.currentPoints).toBe(0);
    });

    it("returns balance for specified customerId in the caller's own (context) tenant", async () => {
      await balanceRepo.upsert(
        new LoyaltyBalanceBuilder()
          .withTenantId(TENANT_ID)
          .withCustomerId(CUSTOMER_ID)
          .withCurrentPoints(55)
          .build(),
      );

      const result = await controller.getBalanceAdmin(CUSTOMER_ID);
      expect(result.currentPoints).toBe(55);
    });

    it("does not leak balance from a different tenant — always scoped to the staff member's own tenant", async () => {
      const OTHER_TENANT = '10000000-0000-7000-8000-000000000002';
      await balanceRepo.upsert(
        new LoyaltyBalanceBuilder()
          .withTenantId(OTHER_TENANT)
          .withCustomerId(CUSTOMER_ID)
          .withCurrentPoints(50)
          .build(),
      );

      const result = await controller.getBalanceAdmin(CUSTOMER_ID);
      expect(result.currentPoints).toBe(0);
    });

    it('returns conversionRate from context settings', async () => {
      const ctx = new RequestContextBuilder()
        .withTenantId(TENANT_ID)
        .withActorId(STAFF_ID)
        .withActorType('STAFF')
        .withActorRole('MANAGER')
        .withSettings(
          new TenantSettingsPropsBuilder().withLoyalty({ pointsPerCurrencyUnit: 5 }).build(),
        )
        .build();
      const managerController = new LoyaltyController(
        new GetLoyaltyBalanceUseCase(balanceRepo, entryRepo),
        new GetLoyaltyEntriesUseCase(entryRepo, serviceCatalog),
        new GetLoyaltyRedemptionsUseCase(redemptionRepo, serviceCatalog),
        new RedeemPointsUseCase(balanceRepo, redemptionRepo, txManager),
        ctx,
        loyaltyCustomer,
      );

      const result = await managerController.getBalanceAdmin(CUSTOMER_ID);
      expect(result.conversionRate).toBe(5);
    });
  });

  describe('getEntriesAdmin() — admin route', () => {
    beforeEach(() => {
      balanceRepo = new InMemoryLoyaltyBalanceRepository();
      txManager = new InMemoryTransactionManager();
      entryRepo = new InMemoryLoyaltyEntryRepository();
      redemptionRepo = new InMemoryLoyaltyRedemptionRepository();
      serviceCatalog = new InMemoryLoyaltyBookingPort();
      loyaltyCustomer = new InMemoryLoyaltyCustomerPort();
      const ctx = new RequestContextBuilder()
        .withTenantId(TENANT_ID)
        .withActorId(STAFF_ID)
        .withActorType('STAFF')
        .withActorRole('STAFF')
        .build();
      controller = new LoyaltyController(
        new GetLoyaltyBalanceUseCase(balanceRepo, entryRepo),
        new GetLoyaltyEntriesUseCase(entryRepo, serviceCatalog),
        new GetLoyaltyRedemptionsUseCase(redemptionRepo, serviceCatalog),
        new RedeemPointsUseCase(balanceRepo, redemptionRepo, txManager),
        ctx,
        loyaltyCustomer,
      );
    });

    it('returns entries for specified customerId', async () => {
      await entryRepo.save(
        new LoyaltyEntryBuilder()
          .withTenantId(TENANT_ID)
          .withCustomerId(CUSTOMER_ID)
          .withPoints(15)
          .build(),
      );

      const result = await controller.getEntriesAdmin(CUSTOMER_ID, { page: 1, limit: 20 });
      expect(result.entries[0].points).toBe(15);
      expect(result.entries[0].bookingId).toBeDefined();
    });
  });

  describe('getRedemptionsAdmin() — admin route', () => {
    beforeEach(() => {
      balanceRepo = new InMemoryLoyaltyBalanceRepository();
      txManager = new InMemoryTransactionManager();
      entryRepo = new InMemoryLoyaltyEntryRepository();
      redemptionRepo = new InMemoryLoyaltyRedemptionRepository();
      serviceCatalog = new InMemoryLoyaltyBookingPort();
      loyaltyCustomer = new InMemoryLoyaltyCustomerPort();
      const ctx = new RequestContextBuilder()
        .withTenantId(TENANT_ID)
        .withActorId(STAFF_ID)
        .withActorType('STAFF')
        .withActorRole('STAFF')
        .build();
      controller = new LoyaltyController(
        new GetLoyaltyBalanceUseCase(balanceRepo, entryRepo),
        new GetLoyaltyEntriesUseCase(entryRepo, serviceCatalog),
        new GetLoyaltyRedemptionsUseCase(redemptionRepo, serviceCatalog),
        new RedeemPointsUseCase(balanceRepo, redemptionRepo, txManager),
        ctx,
        loyaltyCustomer,
      );
    });

    it('returns redemptions for specified customerId', async () => {
      await redemptionRepo.save(
        new LoyaltyRedemptionBuilder()
          .withTenantId(TENANT_ID)
          .withCustomerId(CUSTOMER_ID)
          .withPointsRedeemed(20)
          .build(),
      );

      const result = await controller.getRedemptionsAdmin(CUSTOMER_ID, { page: 1, limit: 20 });
      expect(result.redemptions[0].pointsRedeemed).toBe(20);
    });
  });

  describe('recordRedemption() — admin route', () => {
    beforeEach(() => {
      balanceRepo = new InMemoryLoyaltyBalanceRepository();
      txManager = new InMemoryTransactionManager();
      entryRepo = new InMemoryLoyaltyEntryRepository();
      redemptionRepo = new InMemoryLoyaltyRedemptionRepository();
      serviceCatalog = new InMemoryLoyaltyBookingPort();
      loyaltyCustomer = new InMemoryLoyaltyCustomerPort();
      const ctx = new RequestContextBuilder()
        .withTenantId(TENANT_ID)
        .withActorId(STAFF_ID)
        .withActorType('STAFF')
        .withActorRole('MANAGER')
        .build();
      controller = new LoyaltyController(
        new GetLoyaltyBalanceUseCase(balanceRepo, entryRepo),
        new GetLoyaltyEntriesUseCase(entryRepo, serviceCatalog),
        new GetLoyaltyRedemptionsUseCase(redemptionRepo, serviceCatalog),
        new RedeemPointsUseCase(balanceRepo, redemptionRepo, txManager),
        ctx,
        loyaltyCustomer,
      );
    });

    it('decrements balance and returns redemption result', async () => {
      await balanceRepo.upsert(
        new LoyaltyBalanceBuilder()
          .withTenantId(TENANT_ID)
          .withCustomerId(CUSTOMER_ID)
          .withCurrentPoints(50)
          .build(),
      );

      const result = await controller.recordRedemption({
        customerId: CUSTOMER_ID,
        pointsToRedeem: 20,
        notes: 'Free wash',
        bookingId: null,
      });

      expect(result.newBalance).toBe(30);
      expect(result.pointsRedeemed).toBe(20);
      expect(result.customerId).toBe(CUSTOMER_ID);
    });

    it('maps LoyaltyBalanceNotFoundError to 404 HttpException', async () => {
      let caught: unknown;
      try {
        await controller.recordRedemption({
          customerId: CUSTOMER_ID,
          pointsToRedeem: 10,
          notes: null,
          bookingId: null,
        });
      } catch (err) {
        caught = err;
      }
      expect((caught as { status: number }).status).toBe(404);
    });
  });
});
