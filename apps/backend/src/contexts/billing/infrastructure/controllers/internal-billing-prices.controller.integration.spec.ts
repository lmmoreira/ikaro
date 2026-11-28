import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { InternalApiGuard } from '../../../../shared/guards/internal-api.guard';
import { FeaturePriceVersionEntityBuilder } from '../../../../test/builders/billing';
import { createBillingIntegrationApp } from '../../../../test/utils/billing-integration-app';
import { FeaturePriceVersionEntity } from '../entities/feature-price-version.entity';

const INTERNAL_KEY = 'integ-public-prices-key-integ-x'; // ≥32 chars
const URL = '/internal/billing/public-prices';

// The seed migration fills the whole natural-key space in every integration database, so this spec
// never inserts a price: it reads the seeded rows and adds a synthetic announced version dated far in
// the future to one of them, deleting exactly the row it added (symmetric teardown: `feature_prices`
// is a global table and the Testcontainers database is shared by every spec file of a run).
describe('InternalBillingPricesController (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  const addedVersionIds: string[] = [];

  const get = (query: Record<string, string> = {}) =>
    request(app.getHttpServer()).get(URL).query(query).set('X-Internal-Key', INTERNAL_KEY);

  beforeAll(async () => {
    process.env['INTERNAL_API_KEY'] = INTERNAL_KEY;
    ({ app, ds } = await createBillingIntegrationApp({
      extraProviders: [{ provide: APP_GUARD, useClass: InternalApiGuard }],
    }));
  });

  afterEach(async () => {
    if (addedVersionIds.length > 0) {
      await ds.query(
        `DELETE FROM "billing"."feature_price_versions" WHERE "id" = ANY($1::uuid[])`,
        [addedVersionIds],
      );
      addedVersionIds.length = 0;
    }
  });

  afterAll(async () => {
    await app.close();
    delete process.env['INTERNAL_API_KEY'];
  });

  async function announceFutureVersion(featureKey: string, tier: string, amountMinor: number) {
    const rows: Array<{ id: string }> = await ds.query(
      `SELECT "id" FROM "billing"."feature_prices"
       WHERE "country_code" = 'BR' AND "feature_key" = $1 AND "tier" = $2 AND "cycle" = 'MONTHLY'`,
      [featureKey, tier],
    );
    const entity = new FeaturePriceVersionEntityBuilder()
      .withFeaturePriceId(rows[0].id)
      .withAmountMinor(amountMinor)
      .withEffectiveFrom('2099-01-01')
      .withAnnouncedAt(new Date('2026-01-01T00:00:00Z'))
      .withReason('integration test')
      .build();
    await ds.getRepository(FeaturePriceVersionEntity).insert(entity);
    addedVersionIds.push(entity.id);
  }

  it('returns the seeded Brazilian price list with the country envelope', async () => {
    const { body } = await get({ country: 'BR' }).expect(200);

    expect(body).toMatchObject({
      offered: true,
      countryCode: 'BR',
      currency: 'BRL',
      taxBehavior: 'INCLUSIVE',
    });
    const hotsite = body.prices.find(
      (p: { featureKey: string; tier: string }) =>
        p.featureKey === 'HOTSITE' && p.tier === 'STANDARD',
    );
    expect(hotsite).toMatchObject({ amountMinor: 4900, cycle: 'MONTHLY', currency: 'BRL' });
    expect(hotsite).not.toHaveProperty('upcoming');
  });

  it('shows an announced future version only as `upcoming`, never as the current amount', async () => {
    await announceFutureVersion('HOTSITE', 'STANDARD', 5900);

    const { body } = await get({ country: 'BR' }).expect(200);

    const hotsite = body.prices.find(
      (p: { featureKey: string; tier: string }) =>
        p.featureKey === 'HOTSITE' && p.tier === 'STANDARD',
    );
    expect(hotsite.amountMinor).toBe(4900);
    expect(hotsite.upcoming).toEqual({ amountMinor: 5900, effectiveFrom: '2099-01-01' });
  });

  it('forgets the future version once it is removed (the spec leaves the seed as it found it)', async () => {
    const { body } = await get({ country: 'BR' }).expect(200);

    expect(JSON.stringify(body)).not.toContain('2099-01-01');
  });

  it('answers not offered for the US although its seed rows exist', async () => {
    const { body } = await get({ country: 'US' }).expect(200);

    expect(body).toEqual({ offered: false });
  });

  it('answers not offered for a well-formed country the platform does not know', async () => {
    const { body } = await get({ country: 'ZZ' }).expect(200);

    expect(body).toEqual({ offered: false });
  });

  it.each([['B1'], ['BRA'], ['']])('answers 400 for a malformed country %j', async (country) => {
    const { body } = await get({ country }).expect(400);

    expect(body.code).toBe('COUNTRY_CODE_FORMAT_INVALID');
  });

  it('answers 400 when the country is missing', async () => {
    const { body } = await get().expect(400);

    expect(body.code).toBe('COUNTRY_CODE_FORMAT_INVALID');
  });

  it('accepts a lowercase country', async () => {
    const { body } = await get({ country: 'br' }).expect(200);

    expect(body).toMatchObject({ offered: true, countryCode: 'BR' });
  });

  it('carries no tenant field: only the envelope and price fields', async () => {
    const { body } = await get({ country: 'BR' }).expect(200);

    expect(Object.keys(body).sort()).toEqual(
      ['countryCode', 'currency', 'offered', 'prices', 'taxBehavior'].sort(),
    );
    for (const price of body.prices) {
      expect(Object.keys(price)).not.toContain('tenantId');
    }
  });

  it('returns 401 without the internal key', async () => {
    await request(app.getHttpServer()).get(URL).query({ country: 'BR' }).expect(401);
  });
});
