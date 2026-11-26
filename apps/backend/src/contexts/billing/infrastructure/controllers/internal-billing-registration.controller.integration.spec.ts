import { CURRENT_TERMS_VERSION } from '@ikaro/types';
import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { DataSource, In } from 'typeorm';
import { SignupErrorCode } from '@ikaro/types';
import { InternalApiGuard } from '../../../../shared/guards/internal-api.guard';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { TypeOrmTransactionManager } from '../../../../shared/infrastructure/typeorm-transaction-manager';
import {
  SignupRegistrationEntityBuilder,
  SubscriptionEntityBuilder,
} from '../../../../test/builders/billing';
import { TenantEntityBuilder } from '../../../../test/builders/platform';
import {
  databaseNow,
  holdTransaction,
  waitForBlockedLock,
} from '../../../../test/utils/booking-lock-race-world';
import { createBillingIntegrationApp } from '../../../../test/utils/billing-integration-app';
import { newValidCpf } from '../../../../test/utils/valid-cpf';
import {
  ISignupRegistrationLockPort,
  SIGNUP_REGISTRATION_LOCK,
} from '../../application/ports/signup-registration-lock.port';
import {
  ISignupRegistrationRepository,
  SIGNUP_REGISTRATION_REPOSITORY,
} from '../../application/ports/signup-registration-repository.port';
import { TenantEntity } from '../../../platform/infrastructure/entities/tenant.entity';
import { SignupRegistrationEntity } from '../entities/signup-registration.entity';
import { SubscriptionEntity } from '../entities/subscription.entity';

const INTERNAL_KEY = 'integ-registrations-key-integ-x'; // ≥32 chars
const CPF = '529.982.247-25';
const CPF_NORMALISED = '52998224725';
const URL = '/internal/billing/registrations';
// The Terms version a self-signup must accept (a code constant shared with the web).
const TERMS = CURRENT_TERMS_VERSION;

describe('InternalBillingRegistrationController (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  const subs: string[] = [];
  const operatorIds: string[] = [];
  const tenantIds: string[] = [];

  const newSub = (): string => {
    const sub = `sub-${uuidv7()}`;
    subs.push(sub);
    return sub;
  };

  const post = (body: object) =>
    request(app.getHttpServer()).post(URL).set('X-Internal-Key', INTERNAL_KEY).send(body);

  // A complete self-signup body: what the BFF sends after Platform validated the slug.
  const selfSignup = (googleSub: string, extra: object = {}) => ({
    source: 'SELF_SIGNUP',
    googleSub,
    countryCode: 'BR',
    taxId: newValidCpf(),
    terms: { version: TERMS },
    ...extra,
  });

  // An earlier self-signup of `googleSub`: a COMPLETED registration, its tenant and its subscription
  // (`paid` is whether it ever paid). `createdAt` orders the registrations of one Google account.
  const seedTenantOf = async (
    googleSub: string,
    label: string,
    createdAt: string,
    paid = false,
  ): Promise<{ tenantId: string; slug: string }> => {
    const tenantId = uuidv7();
    tenantIds.push(tenantId);
    const slug = `${label}-${tenantId.slice(-12)}`;
    await ds
      .getRepository(TenantEntity)
      .insert(new TenantEntityBuilder().withId(tenantId).withSlug(slug).build());
    await ds
      .getRepository(SignupRegistrationEntity)
      .insert(
        new SignupRegistrationEntityBuilder()
          .withGoogleSub(googleSub)
          .completedFor(tenantId)
          .withCreatedAt(new Date(createdAt))
          .build(),
      );
    await ds
      .getRepository(SubscriptionEntity)
      .insert(new SubscriptionEntityBuilder().withTenantId(tenantId).withHasEverPaid(paid).build());
    return { tenantId, slug };
  };

  const get = (path: string) =>
    request(app.getHttpServer()).get(`${URL}${path}`).set('X-Internal-Key', INTERNAL_KEY);

  const rowsOf = (googleSub: string) =>
    ds.getRepository(SignupRegistrationEntity).findBy({ googleSub });

  beforeAll(async () => {
    process.env['INTERNAL_API_KEY'] = INTERNAL_KEY;
    ({ app, ds } = await createBillingIntegrationApp({
      extraProviders: [{ provide: APP_GUARD, useClass: InternalApiGuard }],
    }));
  });

  // Only rows this spec created: its own Google subs (SELF_SIGNUP) and the ids it was handed back
  // (OPERATOR rows have no sub), so an overlapping run's fixtures are never touched.
  afterEach(async () => {
    await ds.query(
      `DELETE FROM "billing"."signup_registrations" WHERE "google_sub" = ANY($1::text[]) OR "id" = ANY($2::uuid[])`,
      [subs, operatorIds],
    );
    await ds.query(`DELETE FROM "billing"."subscriptions" WHERE "tenant_id" = ANY($1::uuid[])`, [
      tenantIds,
    ]);
    await ds.query(`DELETE FROM "platform"."tenants" WHERE "id" = ANY($1::uuid[])`, [tenantIds]);
    subs.length = 0;
    operatorIds.length = 0;
    tenantIds.length = 0;
  });

  afterAll(async () => {
    await app.close();
    delete process.env['INTERNAL_API_KEY'];
  });

  it('returns 401 without the internal key, and persists nothing', async () => {
    const googleSub = newSub();

    await request(app.getHttpServer())
      .post(URL)
      .send({ source: 'SELF_SIGNUP', googleSub, terms: { version: 'v1' } })
      .expect(401);

    expect(await rowsOf(googleSub)).toHaveLength(0);
  });

  it('persists a RESERVED row and returns its id (SELF_SIGNUP)', async () => {
    const googleSub = newSub();

    const { body } = await post({
      source: 'SELF_SIGNUP',
      googleSub,
      taxId: CPF,
      countryCode: 'BR',
      terms: { version: TERMS },
    }).expect(201);

    expect(body).toEqual({ registrationId: expect.any(String), trialAvailable: true });
    const [row] = await rowsOf(googleSub);
    expect(row).toMatchObject({
      id: body.registrationId,
      status: 'RESERVED',
      source: 'SELF_SIGNUP',
      tenantId: null,
      taxId: CPF_NORMALISED,
      taxIdType: 'CPF',
      termsVersion: TERMS,
    });
    expect(row.termsAcceptedAt).toBeInstanceOf(Date);
  });

  it('answers trialAvailable false with no id and no row for a Google account with an in-flight registration', async () => {
    const googleSub = newSub();
    await post(selfSignup(googleSub)).expect(201);

    const { body } = await post(selfSignup(googleSub)).expect(201);

    expect(body).toEqual({ registrationId: null, trialAvailable: false });
    expect(await rowsOf(googleSub)).toHaveLength(1);
  });

  it('a COMPLETED row survives a later reservation for the same sub unchanged', async () => {
    const googleSub = newSub();
    const tenantId = uuidv7();
    const completed = new SignupRegistrationEntityBuilder()
      .withGoogleSub(googleSub)
      .completedFor(tenantId)
      .build();
    await ds.getRepository(SignupRegistrationEntity).insert(completed);

    // No subscription exists for that tenant, so the history is unpaid: ineligible, nothing inserted.
    const { body } = await post(selfSignup(googleSub)).expect(201);

    expect(body.trialAvailable).toBe(false);
    const rows = await rowsOf(googleSub);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: completed.id, status: 'COMPLETED', tenantId });
  });

  it('creates independent RESERVED rows for repeated OPERATOR reservations', async () => {
    const first = await post({ source: 'OPERATOR', taxId: CPF, countryCode: 'BR' }).expect(201);
    const second = await post({ source: 'OPERATOR', taxId: CPF, countryCode: 'BR' }).expect(201);
    operatorIds.push(first.body.registrationId, second.body.registrationId);

    expect(first.body).toMatchObject({ trialAvailable: true });
    expect(second.body).toMatchObject({ trialAvailable: true });
    expect(first.body.registrationId).not.toBe(second.body.registrationId);
    const rows = await ds.getRepository(SignupRegistrationEntity).findBy({ id: In(operatorIds) });
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.source === 'OPERATOR' && row.status === 'RESERVED')).toBe(true);
  });

  it('persists the exempt flag of an OPERATOR registration, which needs no tax id', async () => {
    const { body } = await post({ source: 'OPERATOR', exempt: true }).expect(201);
    operatorIds.push(body.registrationId);

    expect(body).toMatchObject({ trialAvailable: true });
    const row = await ds.getRepository(SignupRegistrationEntity).findOneByOrFail({
      id: body.registrationId,
    });
    expect(row).toMatchObject({
      source: 'OPERATOR',
      status: 'RESERVED',
      exempt: true,
      taxId: null,
    });
  });

  it('defaults exempt to false for an OPERATOR registration', async () => {
    const { body } = await post({ source: 'OPERATOR', taxId: CPF, countryCode: 'BR' }).expect(201);
    operatorIds.push(body.registrationId);

    const row = await ds.getRepository(SignupRegistrationEntity).findOneByOrFail({
      id: body.registrationId,
    });
    expect(row.exempt).toBe(false);
  });

  it('answers 400 for exempt on a SELF_SIGNUP, inserting nothing', async () => {
    const googleSub = newSub();

    await post(selfSignup(googleSub, { exempt: true })).expect(400);

    expect(await rowsOf(googleSub)).toHaveLength(0);
  });

  it('answers 422 SIGNUP_TERMS_NOT_ACCEPTED for a SELF_SIGNUP without terms, inserting nothing', async () => {
    const googleSub = newSub();

    const { body } = await post(selfSignup(googleSub, { terms: undefined })).expect(422);

    expect(body.code).toBe(SignupErrorCode.TERMS_NOT_ACCEPTED);
    expect(await rowsOf(googleSub)).toHaveLength(0);
  });

  // Billing owns the Terms version (decided at M26-S24 discovery): a stale one is refused here,
  // against the version the session read reported, before the lock and with nothing written.
  it('answers 422 SIGNUP_TERMS_NOT_ACCEPTED for a Terms version that is not the current one', async () => {
    const googleSub = newSub();

    const { body } = await post(selfSignup(googleSub, { terms: { version: '2020-01' } })).expect(
      422,
    );

    expect(body.code).toBe(SignupErrorCode.TERMS_NOT_ACCEPTED);
    expect(await rowsOf(googleSub)).toHaveLength(0);
  });

  // A country the platform knows but does not offer for signup is a business refusal (422); an
  // unknown code never reaches the use case: the shared country schema answers 400.
  it('answers 422 SIGNUP_COUNTRY_NOT_SUPPORTED for the US, inserting nothing', async () => {
    const googleSub = newSub();

    const { body } = await post(
      selfSignup(googleSub, { countryCode: 'US', taxId: '12-3456789' }),
    ).expect(422);

    expect(body.code).toBe(SignupErrorCode.COUNTRY_NOT_SUPPORTED);
    expect(await rowsOf(googleSub)).toHaveLength(0);
  });

  it('answers 400 for a country code the platform does not know, inserting nothing', async () => {
    const googleSub = newSub();

    await post(selfSignup(googleSub, { countryCode: 'ZZ' })).expect(400);

    expect(await rowsOf(googleSub)).toHaveLength(0);
  });

  it('answers 422 SIGNUP_TAX_ID_REQUIRED for a SELF_SIGNUP without a tax id, inserting nothing', async () => {
    const googleSub = newSub();

    const { body } = await post(selfSignup(googleSub, { taxId: undefined })).expect(422);

    expect(body.code).toBe(SignupErrorCode.TAX_ID_REQUIRED);
    expect(await rowsOf(googleSub)).toHaveLength(0);
  });

  it('answers 422 SIGNUP_TAX_ID_INVALID for a bad CPF, inserting nothing', async () => {
    const googleSub = newSub();

    const { body } = await post(selfSignup(googleSub, { taxId: '111.111.111-11' })).expect(422);

    expect(body.code).toBe(SignupErrorCode.TAX_ID_INVALID);
    expect(await rowsOf(googleSub)).toHaveLength(0);
  });

  it.each([
    [
      'SELF_SIGNUP without googleSub',
      { source: 'SELF_SIGNUP', countryCode: 'BR', terms: { version: TERMS } },
    ],
    [
      'SELF_SIGNUP without countryCode',
      { source: 'SELF_SIGNUP', googleSub: 'sub-x', terms: { version: TERMS } },
    ],
    ['taxId without countryCode', { source: 'OPERATOR', taxId: CPF }],
  ])('answers 400 for %s', async (_name, body) => {
    await post(body).expect(400);
  });

  // B-A1: two simultaneous self-signups of one Google account with an empty history. The lock
  // queues them, so exactly one passes and the other sees the first's RESERVED row. The history
  // read is slowed so that, without the lock, both would read an empty history and both would pass.
  describe('lock B-A1', () => {
    it('lets exactly one of two concurrent signups of one Google account win', async () => {
      const googleSub = newSub();
      const body = selfSignup(googleSub);
      const registrations = app.get<ISignupRegistrationRepository>(SIGNUP_REGISTRATION_REPOSITORY);
      const readHistory = registrations.findGoogleSubHistory.bind(registrations);
      const slowRead = jest
        .spyOn(registrations, 'findGoogleSubHistory')
        .mockImplementation(async (sub) => {
          const history = await readHistory(sub);
          await new Promise((resolveWait) => setTimeout(resolveWait, 200));
          return history;
        });

      const results = await Promise.all([post(body), post(body)]).finally(() =>
        slowRead.mockRestore(),
      );

      const flags = results.map((res) => res.body.trialAvailable).sort();
      expect(results.map((res) => res.status)).toEqual([201, 201]);
      expect(flags).toEqual([false, true]);
      expect(await rowsOf(googleSub)).toHaveLength(1);
    });

    it('parks a reservation behind a holder of the same Google account until it commits', async () => {
      const googleSub = newSub();
      const lock = app.get<ISignupRegistrationLockPort>(SIGNUP_REGISTRATION_LOCK);
      const txManager = new TypeOrmTransactionManager(ds);
      const holder = await holdTransaction({ txManager }, () =>
        lock.lockSignupRegistration(googleSub),
      );
      const since = await databaseNow(ds);

      let settled = false;
      const pending = post(selfSignup(googleSub)).then((res) => {
        settled = true;
        return res;
      });
      await waitForBlockedLock(ds, 'advisory', since);
      expect(settled).toBe(false);
      expect(await rowsOf(googleSub)).toHaveLength(0);

      await holder.release();
      const res = await pending;

      expect(res.body.trialAvailable).toBe(true);
    });

    it('does not queue reservations of different Google accounts', async () => {
      const lock = app.get<ISignupRegistrationLockPort>(SIGNUP_REGISTRATION_LOCK);
      const txManager = new TypeOrmTransactionManager(ds);
      const holder = await holdTransaction({ txManager }, () =>
        lock.lockSignupRegistration(newSub()),
      );

      const res = await post(selfSignup(newSub()));

      expect(res.body.trialAvailable).toBe(true);
      await holder.release();
    });
  });

  describe('GET /eligibility (read-only, UC-127)', () => {
    it('answers 401 without the internal key', async () => {
      await request(app.getHttpServer())
        .get(`${URL}/eligibility`)
        .query({ googleSub: 'sub-x' })
        .expect(401);
    });

    it('answers 400 without a googleSub', async () => {
      await get('/eligibility').expect(400);
    });

    it('answers available with the terms version for a Google account with no history, inserting nothing', async () => {
      const googleSub = newSub();

      const { body } = await get('/eligibility').query({ googleSub }).expect(200);

      expect(body).toEqual({ trialAvailable: true, existingTenantSlug: null, termsVersion: TERMS });
      expect(await rowsOf(googleSub)).toHaveLength(0);
    });

    it('answers unavailable (and no slug yet) while a reservation is in flight, still inserting nothing more', async () => {
      const googleSub = newSub();
      await post(selfSignup(googleSub)).expect(201);

      const { body } = await get('/eligibility').query({ googleSub }).expect(200);

      expect(body).toMatchObject({ trialAvailable: false, existingTenantSlug: null });
      expect(await rowsOf(googleSub)).toHaveLength(1);
    });

    it("returns the slug of the earliest unpaid tenant of that Google account, and no other account's", async () => {
      const googleSub = newSub();
      const otherSub = newSub();
      const early = await seedTenantOf(googleSub, 'eligible-early', '2026-10-01T00:00:00Z');
      await seedTenantOf(googleSub, 'eligible-late', '2026-10-05T00:00:00Z');
      await seedTenantOf(otherSub, 'eligible-other', '2026-09-01T00:00:00Z');

      const { body } = await get('/eligibility').query({ googleSub }).expect(200);

      expect(body).toEqual({
        trialAvailable: false,
        existingTenantSlug: early.slug,
        termsVersion: TERMS,
      });
    });

    it('does not offer a slug for a tenant that already paid', async () => {
      const googleSub = newSub();
      await seedTenantOf(googleSub, 'eligible-paid', '2026-10-01T00:00:00Z', true);

      const { body } = await get('/eligibility').query({ googleSub }).expect(200);

      expect(body).toMatchObject({ trialAvailable: true, existingTenantSlug: null });
    });

    // Negative guarantee: a read never takes lock B-A1.
    it('is not parked behind a holder of the Google account lock', async () => {
      const googleSub = newSub();
      const lock = app.get<ISignupRegistrationLockPort>(SIGNUP_REGISTRATION_LOCK);
      const holder = await holdTransaction({ txManager: new TypeOrmTransactionManager(ds) }, () =>
        lock.lockSignupRegistration(googleSub),
      );

      const { body } = await get('/eligibility').query({ googleSub }).expect(200);

      expect(body.trialAvailable).toBe(true);
      await holder.release();
    });
  });

  describe('POST /:id/release (UC-127)', () => {
    const release = (id: string) =>
      request(app.getHttpServer())
        .post(`${URL}/${id}/release`)
        .set('X-Internal-Key', INTERNAL_KEY)
        .send();

    it('answers 401 without the internal key', async () => {
      await request(app.getHttpServer()).post(`${URL}/${uuidv7()}/release`).expect(401);
    });

    it('answers 400 for an id that is not a UUID', async () => {
      await release('not-a-uuid').expect(400);
    });

    it('deletes a RESERVED row, so an immediate retry is eligible again', async () => {
      const googleSub = newSub();
      const reserved = await post(selfSignup(googleSub)).expect(201);

      await release(reserved.body.registrationId).expect(200, { released: true });

      expect(await rowsOf(googleSub)).toHaveLength(0);
      const retry = await post(selfSignup(googleSub)).expect(201);
      expect(retry.body.trialAvailable).toBe(true);
    });

    it('is idempotent: a second release and an unknown id answer released: false', async () => {
      const googleSub = newSub();
      const reserved = await post(selfSignup(googleSub)).expect(201);
      await release(reserved.body.registrationId).expect(200);

      await release(reserved.body.registrationId).expect(200, { released: false });
      await release(uuidv7()).expect(200, { released: false });
    });

    // Negative guarantee: a COMPLETED registration has a tenant behind it and is never deleted.
    it('never deletes a COMPLETED registration', async () => {
      const googleSub = newSub();
      const completed = new SignupRegistrationEntityBuilder()
        .withGoogleSub(googleSub)
        .completedFor(uuidv7())
        .build();
      await ds.getRepository(SignupRegistrationEntity).insert(completed);

      await release(completed.id).expect(200, { released: false });

      expect(await rowsOf(googleSub)).toHaveLength(1);
    });

    // `scripts/provision-tenant.sh` reserves an OPERATOR registration and releases it after a
    // definite refusal of the tenant call.
    it('releases a RESERVED OPERATOR registration too', async () => {
      const operator = await post({ source: 'OPERATOR' }).expect(201);
      operatorIds.push(operator.body.registrationId);

      await release(operator.body.registrationId).expect(200, { released: true });

      await expect(
        ds.getRepository(SignupRegistrationEntity).existsBy({ id: operator.body.registrationId }),
      ).resolves.toBe(false);
    });
  });
});
