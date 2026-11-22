import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import {
  ProviderEventEntityBuilder,
  SignupRegistrationEntityBuilder,
  SubscriptionEntityBuilder,
} from '../../../../test/builders/billing';
import { InMemoryOutboxPublisher } from '../../../../test/infrastructure/in-memory-outbox-publisher';
import { createTestDataSource } from '../../../../test/test-datasource';
import { ProviderEventEntity } from '../entities/provider-event.entity';
import { ProviderHealthEntity } from '../entities/provider-health.entity';
import { SignupRegistrationEntity } from '../entities/signup-registration.entity';
import { SubscriptionEntity } from '../entities/subscription.entity';
import { TypeOrmProviderEventRepository } from './typeorm-provider-event.repository';
import { TypeOrmProviderHealthRepository } from './typeorm-provider-health.repository';
import { TypeOrmSignupRegistrationRepository } from './typeorm-signup-registration.repository';
import { TypeOrmSubscriptionRepository } from './typeorm-subscription.repository';

const HOUR_MS = 3_600_000;

// The reads and writes the self-heal job (UC-140, M26-S08) adds to Billing's repositories, against
// Postgres. Every row is this spec's own (fresh ids and keys) and removed after each test.
describe('Billing self-heal repository methods (integration, UC-140)', () => {
  let ds: DataSource;
  let health: TypeOrmProviderHealthRepository;
  let events: TypeOrmProviderEventRepository;
  let registrations: TypeOrmSignupRegistrationRepository;
  let subscriptions: TypeOrmSubscriptionRepository;
  const healthKeys: string[] = [];
  const eventIds: string[] = [];
  const registrationIds: string[] = [];
  const tenantIds: string[] = [];

  const newKey = (): string => {
    const key = `TEST_${uuidv7().slice(-12)}`;
    healthKeys.push(key);
    return key;
  };
  const row = (key: string) =>
    ds.getRepository(ProviderHealthEntity).findOneByOrFail({ merchantProfileKey: key });

  beforeAll(async () => {
    ds = await createTestDataSource();
    health = new TypeOrmProviderHealthRepository(ds.getRepository(ProviderHealthEntity));
    events = new TypeOrmProviderEventRepository(ds.getRepository(ProviderEventEntity));
    registrations = new TypeOrmSignupRegistrationRepository(
      ds.getRepository(SignupRegistrationEntity),
    );
    subscriptions = new TypeOrmSubscriptionRepository(
      ds.getRepository(SubscriptionEntity),
      new InMemoryOutboxPublisher(),
    );
  });

  afterEach(async () => {
    await ds.query(
      `DELETE FROM "billing"."provider_health" WHERE "merchant_profile_key" = ANY($1::text[])`,
      [healthKeys],
    );
    await ds.query(`DELETE FROM "billing"."provider_events" WHERE "event_id" = ANY($1::text[])`, [
      eventIds,
    ]);
    await ds.query(`DELETE FROM "billing"."signup_registrations" WHERE "id" = ANY($1::uuid[])`, [
      registrationIds,
    ]);
    await ds.query(`DELETE FROM "billing"."subscriptions" WHERE "tenant_id" = ANY($1::uuid[])`, [
      tenantIds,
    ]);
    for (const list of [healthKeys, eventIds, registrationIds, tenantIds]) list.length = 0;
  });

  afterAll(async () => {
    await ds.destroy();
  });

  describe('provider_health', () => {
    it('counts consecutive failed reads with an atomic increment, creating the row when absent', async () => {
      const key = newKey();
      const at = new Date();

      await expect(health.recordHealthReadFailure(key, at)).resolves.toBe(1);
      await expect(health.recordHealthReadFailure(key, at)).resolves.toBe(2);

      expect((await row(key)).healthReadFailures).toBe(2);
      expect(await health.findByKey(key)).toMatchObject({
        freezeActive: false,
        webhookStatus: 'UNKNOWN',
      });
    });

    it('two overlapping failed reads never lose an increment', async () => {
      const key = newKey();

      await Promise.all([
        health.recordHealthReadFailure(key, new Date()),
        health.recordHealthReadFailure(key, new Date()),
      ]);

      expect((await row(key)).healthReadFailures).toBe(2);
    });

    it('a successful read resets the counter and sets the webhook status, leaving the freeze and reconcile instants alone', async () => {
      const key = newKey();
      const reconciledAt = new Date(Date.now() - HOUR_MS);
      await health.recordReconcileOk(key, reconciledAt, false);
      await health.setFreeze(key, new Date(Date.now() - 2 * HOUR_MS));
      await health.recordHealthReadFailure(key, new Date());

      await health.recordHealthReadOk(key, 'OK', new Date(), false);

      expect(await row(key)).toMatchObject({
        healthReadFailures: 0,
        webhookStatus: 'OK',
        freezeActive: true,
        lastReconcileOkAt: reconciledAt,
      });
    });

    it('only a re-enable moves updated_at (the instant a delivery must post-date)', async () => {
      const key = newKey();
      const first = new Date(Date.now() - 3 * HOUR_MS);
      await health.recordHealthReadOk(key, 'PAUSED', first, true);

      await health.recordHealthReadOk(key, 'PAUSED', new Date(), false);
      expect((await row(key)).updatedAt).toEqual(first);

      const reenabled = new Date();
      await health.recordHealthReadOk(key, 'PAUSED', reenabled, true);
      expect((await row(key)).updatedAt).toEqual(reenabled);
    });

    it('starts and ends the freeze with both columns together, so the table check never fires, and reports a no-op', async () => {
      const key = newKey();
      await health.recordReconcileOk(key, new Date(), false);
      const since = new Date();

      await expect(health.setFreeze(key, since)).resolves.toBe(true);
      expect(await row(key)).toMatchObject({ freezeActive: true, freezeSince: since });
      await expect(health.setFreeze(key, since)).resolves.toBe(false);
      expect(await health.listFrozenKeys()).toContain(key);

      await expect(health.setFreeze(key, null)).resolves.toBe(true);
      expect(await row(key)).toMatchObject({ freezeActive: false, freezeSince: null });
      await expect(health.setFreeze(key, null)).resolves.toBe(false);
    });

    it('setting a freeze on a key with no row changes nothing (no row means not frozen)', async () => {
      await expect(health.setFreeze(newKey(), new Date())).resolves.toBe(false);
    });
  });

  describe('provider_events.existsProcessedAfter', () => {
    // The ASAAS inbox is shared with every other suite, so the window is far in the future: nothing
    // another suite wrote can be newer than it.
    const FUTURE = new Date('2099-01-01T00:00:00Z');

    const seedEvent = async (receivedAt: Date): Promise<void> => {
      const eventId = `evt-${uuidv7()}`;
      eventIds.push(eventId);
      const tenantId = uuidv7();
      await ds
        .getRepository(ProviderEventEntity)
        .insert(
          new ProviderEventEntityBuilder()
            .withProvider('ASAAS')
            .withEventId(eventId)
            .withTenantId(tenantId)
            .withReceivedAt(receivedAt)
            .withProcessedAt(receivedAt)
            .build(),
        );
    };

    it('is true only for a processed delivery received strictly after the instant', async () => {
      await seedEvent(new Date(FUTURE.getTime() - 1000));
      await expect(events.existsProcessedAfter('ASAAS', FUTURE)).resolves.toBe(false);

      await seedEvent(new Date(FUTURE.getTime() + 1000));
      await expect(events.existsProcessedAfter('ASAAS', FUTURE)).resolves.toBe(true);
      await expect(
        events.existsProcessedAfter('ASAAS', new Date(FUTURE.getTime() + 1000)),
      ).resolves.toBe(false);
    });

    it("never counts another provider's delivery", async () => {
      await seedEvent(new Date(FUTURE.getTime() + 1000));

      await expect(events.existsProcessedAfter('STRIPE', FUTURE)).resolves.toBe(false);
    });
  });

  describe('signup_registrations.releaseExpiredReservations', () => {
    const seedRegistration = async (
      configure: (b: SignupRegistrationEntityBuilder) => SignupRegistrationEntityBuilder,
    ) => {
      const entity = configure(new SignupRegistrationEntityBuilder().asOperator()).build();
      registrationIds.push(entity.id);
      await ds.getRepository(SignupRegistrationEntity).insert(entity);
      return entity.id;
    };
    const exists = (id: string) => ds.getRepository(SignupRegistrationEntity).existsBy({ id });

    it('deletes a RESERVED row older than the cutoff, and nothing younger, at the cutoff, or COMPLETED', async () => {
      const cutoff = new Date(Date.now() - HOUR_MS);
      const stale = await seedRegistration((b) =>
        b.withCreatedAt(new Date(cutoff.getTime() - 1000)),
      );
      const atCutoff = await seedRegistration((b) => b.withCreatedAt(cutoff));
      const young = await seedRegistration((b) => b.withCreatedAt(new Date(Date.now() - 60_000)));
      const completed = await seedRegistration((b) =>
        b.withCreatedAt(new Date(cutoff.getTime() - 5 * HOUR_MS)).completedFor(uuidv7()),
      );

      const released = await registrations.releaseExpiredReservations(cutoff);

      expect(released).toBeGreaterThanOrEqual(1);
      expect(await exists(stale)).toBe(false);
      expect(await exists(atCutoff)).toBe(true);
      expect(await exists(young)).toBe(true);
      expect(await exists(completed)).toBe(true);
    });
  });

  describe('subscriptions.findExistingTenantIds', () => {
    it('answers the asked tenants that have a subscription and no others', async () => {
      const withSubscription = uuidv7();
      const without = uuidv7();
      tenantIds.push(withSubscription);
      await ds
        .getRepository(SubscriptionEntity)
        .insert(new SubscriptionEntityBuilder().withTenantId(withSubscription).build());

      await expect(
        subscriptions.findExistingTenantIds([withSubscription, without]),
      ).resolves.toEqual([withSubscription]);
      await expect(subscriptions.findExistingTenantIds([])).resolves.toEqual([]);
    });
  });
});
