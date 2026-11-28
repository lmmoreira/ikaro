import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { DataSource, In } from 'typeorm';
import { SignupErrorCode } from '@ikaro/types';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { InternalApiGuard } from '../../../../shared/guards/internal-api.guard';
import { EVENT_BUS } from '../../../../shared/ports/event-bus.port';
import { OUTBOX_PUBLISHER } from '../../../../shared/ports/outbox-publisher.port';
import { TenantEntityBuilder } from '../../../../test/builders/platform';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTurnstileVerifier } from '../../../../test/infrastructure/in-memory-turnstile-verifier';
import { createPlatformIntegrationApp } from '../../../../test/utils/platform-integration-app';
import { TEST_REGISTRATION_ID } from '../../../../test/utils/test-registration-id';
import { CLOUDFLARE_TURNSTILE_PROVIDER } from '../../application/ports/turnstile-verifier.port';
import { TenantProvisioned } from '../../domain/events/tenant-provisioned.event';
import { HotsiteConfigEntity } from '../entities/hotsite-config.entity';
import { TenantEntity } from '../entities/tenant.entity';

const INTERNAL_KEY = 'integ-signup-key-integ-signup-key-x'; // ≥32 chars
// Random per run: every spec file of a run shares one Postgres. The random
// tail of a uuidv7 keeps every slug below under 30 characters.
const SUFFIX = uuidv7().slice(-8);
const OWNER_SLUG = `ikaro-owner-${SUFFIX}`;
const TAKEN_SLUG = `signup-taken-${SUFFIX}`;
const FRESH_SLUG = `signup-fresh-${SUFFIX}`;
const RACE_SLUG = `signup-race-${SUFFIX}`;
const OTHER_SLUG = `signup-other-${SUFFIX}`;
const ALL_SLUGS = [TAKEN_SLUG, FRESH_SLUG, RACE_SLUG, OTHER_SLUG];

describe('InternalSignupController (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  const eventBus = new InMemoryEventBus();
  const turnstile = new InMemoryTurnstileVerifier();

  const validate = (body: object) =>
    request(app.getHttpServer())
      .post('/internal/signup/validate')
      .set('X-Internal-Key', INTERNAL_KEY)
      .send(body);

  const tenant = (body: object) =>
    request(app.getHttpServer())
      .post('/internal/signup/tenant')
      .set('X-Internal-Key', INTERNAL_KEY)
      .send(body);

  const validBody = (slug: string) => ({
    slug,
    turnstileToken: 'token-1',
    clientIp: '203.0.113.9',
  });

  const tenantBody = (slug: string, registrationId = TEST_REGISTRATION_ID) => ({
    name: 'Lava Car Top',
    slug,
    adminEmail: 'dona@example.com',
    countryCode: 'BR',
    registrationId,
  });

  const tenantsOf = (slugs: string[]) => ds.getRepository(TenantEntity).findBy({ slug: In(slugs) });

  beforeAll(async () => {
    process.env['INTERNAL_API_KEY'] = INTERNAL_KEY;
    process.env['PLATFORM_OWNER_TENANT_SLUG'] = OWNER_SLUG;
    ({ app, ds } = await createPlatformIntegrationApp({
      extraProviders: [{ provide: APP_GUARD, useClass: InternalApiGuard }],
      overrideProviders: [
        { provide: EVENT_BUS, useValue: eventBus },
        { provide: OUTBOX_PUBLISHER, useValue: eventBus },
        { provide: CLOUDFLARE_TURNSTILE_PROVIDER, useValue: turnstile },
      ],
    }));
    await ds
      .getRepository(TenantEntity)
      .save(new TenantEntityBuilder().withSlug(TAKEN_SLUG).build());
  });

  beforeEach(() => {
    turnstile.result = true;
    turnstile.calls.length = 0;
    eventBus.published.length = 0;
  });

  afterAll(async () => {
    const created = await tenantsOf(ALL_SLUGS);
    const ids = created.map((row) => row.id);
    await ds.getRepository(HotsiteConfigEntity).delete({ tenantId: In(ids) });
    await ds.getRepository(TenantEntity).delete({ id: In(ids) });
    await app.close();
    delete process.env['INTERNAL_API_KEY'];
    delete process.env['PLATFORM_OWNER_TENANT_SLUG'];
  });

  describe('auth', () => {
    it.each([['/internal/signup/validate'], ['/internal/signup/tenant']])(
      'answers 401 on %s without the internal key',
      async (path) => {
        await request(app.getHttpServer()).post(path).send({}).expect(401);
      },
    );
  });

  describe('POST /internal/signup/validate', () => {
    it('answers 204 for a free slug with a verified token, forwarding the client IP, and persists nothing', async () => {
      await validate(validBody(FRESH_SLUG)).expect(204);

      expect(turnstile.calls).toEqual([{ token: 'token-1', remoteIp: '203.0.113.9' }]);
      expect(await tenantsOf([FRESH_SLUG])).toHaveLength(0);
    });

    it('answers 400 SIGNUP_TURNSTILE_FAILED when Turnstile refuses the token', async () => {
      turnstile.result = false;

      const { body } = await validate(validBody(FRESH_SLUG)).expect(400);

      expect(body.code).toBe(SignupErrorCode.TURNSTILE_FAILED);
    });

    it('answers 409 SIGNUP_SLUG_TAKEN for a slug a tenant uses, without spending the token', async () => {
      const { body } = await validate(validBody(TAKEN_SLUG)).expect(409);

      expect(body.code).toBe(SignupErrorCode.SLUG_TAKEN);
      expect(turnstile.calls).toHaveLength(0);
    });

    it.each([
      ['dashboard', SignupErrorCode.SLUG_RESERVED],
      [OWNER_SLUG, SignupErrorCode.SLUG_RESERVED],
      ['ab', SignupErrorCode.SLUG_INVALID],
      ['Not Valid', SignupErrorCode.SLUG_INVALID],
    ])('answers 422 for the slug %s (%s), without spending the token', async (slug, code) => {
      const { body } = await validate(validBody(slug)).expect(422);

      expect(body.code).toBe(code);
      expect(turnstile.calls).toHaveLength(0);
    });

    it('answers 400 for a missing Turnstile token or client IP', async () => {
      await validate({ slug: FRESH_SLUG, clientIp: '203.0.113.9' }).expect(400);
      await validate({ slug: FRESH_SLUG, turnstileToken: 't' }).expect(400);
    });
  });

  describe('POST /internal/signup/tenant', () => {
    it('provisions the tenant with a hotsite config and publishes TenantProvisioned with the registration id and the first manager', async () => {
      const registrationId = uuidv7();

      const { body } = await tenant(tenantBody(FRESH_SLUG, registrationId)).expect(201);

      expect(body).toMatchObject({ slug: FRESH_SLUG, name: 'Lava Car Top' });
      const [row] = await tenantsOf([FRESH_SLUG]);
      expect(row.id).toBe(body.tenantId);
      await expect(
        ds.getRepository(HotsiteConfigEntity).countBy({ tenantId: body.tenantId }),
      ).resolves.toBe(1);
      const event = eventBus.published.find(
        (e): e is TenantProvisioned => e.eventName === 'TenantProvisioned',
      );
      expect(event?.data).toMatchObject({
        adminEmail: 'dona@example.com',
        countryCode: 'BR',
        registrationId,
      });
    });

    // Negative guarantee: Turnstile's token is single-use and was consumed by `validate`.
    it('never verifies Turnstile', async () => {
      await tenant(tenantBody(OTHER_SLUG)).expect(201);

      expect(turnstile.calls).toHaveLength(0);
    });

    it('answers 409 SIGNUP_SLUG_TAKEN, not the operator code, for a slug already in use, creating nothing', async () => {
      const before = await ds.getRepository(TenantEntity).count();

      const { body } = await tenant(tenantBody(TAKEN_SLUG)).expect(409);

      expect(body.code).toBe(SignupErrorCode.SLUG_TAKEN);
      await expect(ds.getRepository(TenantEntity).count()).resolves.toBe(before);
    });

    // The race the validate-time availability check cannot close: two submits for one slug.
    it('lets exactly one of two simultaneous signups for one slug create the tenant', async () => {
      const results = await Promise.all([
        tenant(tenantBody(RACE_SLUG, uuidv7())),
        tenant(tenantBody(RACE_SLUG, uuidv7())),
      ]);

      expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
      const loser = results.find((res) => res.status === 409);
      expect(loser?.body.code).toBe(SignupErrorCode.SLUG_TAKEN);
      expect(await tenantsOf([RACE_SLUG])).toHaveLength(1);
    });

    // Negative guarantee: only the operator path may provision Ikaro's own tenant.
    it('refuses the platform owner slug with 422 SIGNUP_SLUG_RESERVED', async () => {
      const { body } = await tenant(tenantBody(OWNER_SLUG)).expect(422);

      expect(body.code).toBe(SignupErrorCode.SLUG_RESERVED);
      expect(await tenantsOf([OWNER_SLUG])).toHaveLength(0);
    });

    it.each([
      ['a registrationId that is not a UUID', { registrationId: 'nope' }],
      ['an invalid email', { adminEmail: 'nope' }],
      ['no country', { countryCode: undefined }],
    ])('answers 400 for %s', async (_name, overrides) => {
      await tenant({ ...tenantBody(OTHER_SLUG), ...overrides }).expect(400);
    });

    // Tenant isolation (the only one this tenant-less route has): creating a tenant never touches
    // another tenant's row.
    it('leaves an existing tenant untouched', async () => {
      const [before] = await tenantsOf([TAKEN_SLUG]);

      await tenant(tenantBody(OTHER_SLUG, uuidv7()));

      const [after] = await tenantsOf([TAKEN_SLUG]);
      expect(after).toEqual(before);
    });
  });
});
