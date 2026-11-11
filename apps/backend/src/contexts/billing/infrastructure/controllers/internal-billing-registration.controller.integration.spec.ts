import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { SignupErrorCode } from '@ikaro/types';
import { InternalApiGuard } from '../../../../shared/guards/internal-api.guard';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { TypeOrmTransactionManager } from '../../../../shared/infrastructure/typeorm-transaction-manager';
import { SignupRegistrationEntityBuilder } from '../../../../test/builders/billing';
import {
  databaseNow,
  holdTransaction,
  waitForBlockedLock,
} from '../../../../test/utils/booking-lock-race-world';
import { createBillingIntegrationApp } from '../../../../test/utils/billing-integration-app';
import {
  ISignupRegistrationLockPort,
  SIGNUP_REGISTRATION_LOCK,
} from '../../application/ports/signup-registration-lock.port';
import {
  ISignupRegistrationRepository,
  SIGNUP_REGISTRATION_REPOSITORY,
} from '../../application/ports/signup-registration-repository.port';
import { SignupRegistrationEntity } from '../entities/signup-registration.entity';

const INTERNAL_KEY = 'integ-registrations-key-integ-x'; // ≥32 chars
const CPF = '529.982.247-25';
const CPF_NORMALISED = '52998224725';
const URL = '/internal/billing/registrations';

describe('InternalBillingRegistrationController (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  const subs: string[] = [];

  const newSub = (): string => {
    const sub = `sub-${uuidv7()}`;
    subs.push(sub);
    return sub;
  };

  const post = (body: object) =>
    request(app.getHttpServer()).post(URL).set('X-Internal-Key', INTERNAL_KEY).send(body);

  const rowsOf = (googleSub: string) =>
    ds.getRepository(SignupRegistrationEntity).findBy({ googleSub });

  beforeAll(async () => {
    process.env['INTERNAL_API_KEY'] = INTERNAL_KEY;
    ({ app, ds } = await createBillingIntegrationApp({
      extraProviders: [{ provide: APP_GUARD, useClass: InternalApiGuard }],
    }));
  });

  afterEach(async () => {
    await ds.query(
      `DELETE FROM "billing"."signup_registrations" WHERE "google_sub" = ANY($1::text[]) OR "tax_id" = $2 OR ("source" = 'OPERATOR' AND "created_at" > now() - interval '10 minutes')`,
      [subs, CPF_NORMALISED],
    );
    subs.length = 0;
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
      terms: { version: '2026-11-01' },
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
      termsVersion: '2026-11-01',
    });
    expect(row.termsAcceptedAt).toBeInstanceOf(Date);
  });

  it('answers trialAvailable false with no id and no row for a Google account with an in-flight registration', async () => {
    const googleSub = newSub();
    await post({ source: 'SELF_SIGNUP', googleSub, terms: { version: 'v1' } }).expect(201);

    const { body } = await post({
      source: 'SELF_SIGNUP',
      googleSub,
      terms: { version: 'v1' },
    }).expect(201);

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
    const { body } = await post({
      source: 'SELF_SIGNUP',
      googleSub,
      terms: { version: 'v1' },
    }).expect(201);

    expect(body.trialAvailable).toBe(false);
    const rows = await rowsOf(googleSub);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: completed.id, status: 'COMPLETED', tenantId });
  });

  it('creates independent RESERVED rows for repeated OPERATOR reservations', async () => {
    const before = await ds.getRepository(SignupRegistrationEntity).countBy({ source: 'OPERATOR' });

    const first = await post({ source: 'OPERATOR', taxId: CPF, countryCode: 'BR' }).expect(201);
    const second = await post({ source: 'OPERATOR', taxId: CPF, countryCode: 'BR' }).expect(201);

    expect(first.body).toMatchObject({ trialAvailable: true });
    expect(second.body).toMatchObject({ trialAvailable: true });
    expect(first.body.registrationId).not.toBe(second.body.registrationId);
    const after = await ds.getRepository(SignupRegistrationEntity).countBy({ source: 'OPERATOR' });
    expect(after - before).toBe(2);
  });

  it('answers 422 SIGNUP_TERMS_NOT_ACCEPTED for a SELF_SIGNUP without terms, inserting nothing', async () => {
    const googleSub = newSub();

    const { body } = await post({ source: 'SELF_SIGNUP', googleSub }).expect(422);

    expect(body.code).toBe(SignupErrorCode.TERMS_NOT_ACCEPTED);
    expect(await rowsOf(googleSub)).toHaveLength(0);
  });

  it('answers 422 SIGNUP_TAX_ID_INVALID for a bad CPF, inserting nothing', async () => {
    const googleSub = newSub();

    const { body } = await post({
      source: 'SELF_SIGNUP',
      googleSub,
      taxId: '111.111.111-11',
      countryCode: 'BR',
      terms: { version: 'v1' },
    }).expect(422);

    expect(body.code).toBe(SignupErrorCode.TAX_ID_INVALID);
    expect(await rowsOf(googleSub)).toHaveLength(0);
  });

  it.each([
    ['SELF_SIGNUP without googleSub', { source: 'SELF_SIGNUP', terms: { version: 'v1' } }],
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
      const body = { source: 'SELF_SIGNUP', googleSub, terms: { version: 'v1' } };
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
      const pending = post({ source: 'SELF_SIGNUP', googleSub, terms: { version: 'v1' } }).then(
        (res) => {
          settled = true;
          return res;
        },
      );
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

      const res = await post({
        source: 'SELF_SIGNUP',
        googleSub: newSub(),
        terms: { version: 'v1' },
      });

      expect(res.body.trialAvailable).toBe(true);
      await holder.release();
    });
  });
});
