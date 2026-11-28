import { INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { ErrorFilter } from '../../../../shared/filters/error.filter';
import { TenantAccessGuard } from '../../../../shared/guards/tenant-access.guard';
import {
  BillingAccountEntityBuilder,
  SubscriptionEntityBuilder,
} from '../../../../test/builders/billing';
import { TenantEntityBuilder } from '../../../../test/builders/platform';
import { actorHeaders } from '../../../../test/utils/actor-headers';
import { createSuspendedExperienceApp } from '../../../../test/utils/suspended-experience-integration-app';
import { TenantEntity } from '../../../platform/infrastructure/entities/tenant.entity';
import { BillingAccountEntity } from '../entities/billing-account.entity';
import { SubscriptionEntity } from '../entities/subscription.entity';

const DAY_MS = 24 * 60 * 60 * 1000;
const CPF = '52998224725';
const ADDRESS = {
  street: 'Rua A',
  number: '1',
  neighborhood: 'Centro',
  city: 'Belo Horizonte',
  state: 'MG',
  zipCode: '30130-110',
};

type Role = 'MANAGER' | 'STAFF' | 'CUSTOMER';

describe('Billing identity routes (integration, UC-118)', () => {
  let app: INestApplication;
  let ds: DataSource;
  const tenantIds: string[] = [];

  beforeAll(async () => {
    ({ app, ds } = await createSuspendedExperienceApp([
      { provide: APP_FILTER, useClass: ErrorFilter },
      { provide: APP_GUARD, useClass: TenantAccessGuard },
    ]));
  });

  afterAll(async () => {
    for (const table of ['billing_accounts', 'subscriptions']) {
      await ds.query(`DELETE FROM "billing"."${table}" WHERE "tenant_id" = ANY($1::uuid[])`, [
        tenantIds,
      ]);
    }
    await ds.query(`DELETE FROM "platform"."tenants" WHERE "id" = ANY($1::uuid[])`, [tenantIds]);
    await app.close();
  });

  const seedTenant = async (
    options: {
      suspended?: boolean;
      account?: boolean;
      configure?: (b: BillingAccountEntityBuilder) => BillingAccountEntityBuilder;
    } = {},
  ): Promise<string> => {
    const tenantId = uuidv7();
    tenantIds.push(tenantId);
    await ds.getRepository(TenantEntity).insert(
      new TenantEntityBuilder()
        .withId(tenantId)
        .withSlug(`ident-${tenantId.slice(-12)}`)
        .withCreatedAt(new Date(Date.now() - 30 * DAY_MS))
        .build(),
    );
    const subscription = new SubscriptionEntityBuilder().withTenantId(tenantId);
    if (options.suspended) {
      subscription
        .withSuspension('NON_PAYMENT', new Date(Date.now() - DAY_MS))
        .withTrialEndsAt(null);
    }
    await ds.getRepository(SubscriptionEntity).insert(subscription.build());
    if (options.account !== false) {
      const account = new BillingAccountEntityBuilder().withTenantId(tenantId);
      await ds
        .getRepository(BillingAccountEntity)
        .insert((options.configure ?? ((b) => b))(account).build());
    }
    return tenantId;
  };

  const get = (tenantId: string, role: Role = 'MANAGER') =>
    request(app.getHttpServer())
      .get('/billing/identity')
      .set(actorHeaders(tenantId, uuidv7(), role));

  const put = (tenantId: string, body: unknown, role: Role = 'MANAGER') =>
    request(app.getHttpServer())
      .put('/billing/identity')
      .set(actorHeaders(tenantId, uuidv7(), role))
      .send(body as object);

  it('saves, then reads back the same identity (round trip)', async () => {
    const tenantId = await seedTenant();

    const saved = await put(tenantId, {
      taxId: '529.982.247-25',
      legalName: 'Acme Ltda',
      billingEmail: 'Billing@Acme.test',
      address: ADDRESS,
    }).expect(200);

    expect(saved.body).toEqual({
      provisioning: false,
      taxIdType: 'CPF',
      taxId: CPF,
      legalName: 'Acme Ltda',
      billingEmail: 'billing@acme.test',
      address: { ...ADDRESS, complement: null },
    });
    expect((await get(tenantId).expect(200)).body).toEqual(saved.body);
  });

  it('answers an empty identity as nulls', async () => {
    const tenantId = await seedTenant();

    expect((await get(tenantId).expect(200)).body).toEqual({
      provisioning: false,
      taxIdType: null,
      taxId: null,
      legalName: null,
      billingEmail: null,
      address: null,
    });
  });

  it.each([
    [
      'a bad CPF/CNPJ check digit',
      { taxId: '11222333000182' },
      422,
      'BILLING_IDENTITY_TAX_ID_INVALID',
    ],
    [
      'an alphanumeric CNPJ with bad check digits',
      { taxId: '12ABC34501DE36', taxIdType: 'CNPJ' },
      422,
      'BILLING_IDENTITY_TAX_ID_INVALID',
    ],
    ['an invalid email', { billingEmail: 'nope' }, 422, 'BILLING_IDENTITY_EMAIL_INVALID'],
  ])('answers %s with its documented status and code', async (_label, body, status, code) => {
    const tenantId = await seedTenant();

    const res = await put(tenantId, body).expect(status);

    expect(res.body.code).toBe(code);
  });

  it('accepts an alphanumeric CNPJ with valid check digits through the schema and the backend', async () => {
    const tenantId = await seedTenant();

    const { body } = await put(tenantId, { taxId: '12.abc.345/01de-35', taxIdType: 'CNPJ' }).expect(
      200,
    );

    expect(body).toMatchObject({ taxIdType: 'CNPJ', taxId: '12ABC34501DE35' });
  });

  it('answers a wrong postal code or state with the shared Address error codes (400)', async () => {
    const tenantId = await seedTenant();
    await put(tenantId, { address: ADDRESS }).expect(200);

    const zip = await put(tenantId, { address: { zipCode: '30140-07' } }).expect(400);
    const state = await put(tenantId, { address: { state: 'M1' } }).expect(400);

    expect(zip.body.code).toBe('ADDRESS_POSTAL_CODE_INVALID');
    expect(state.body.code).toBe('ADDRESS_STATE_INVALID');
  });

  it('answers an incomplete merged address with the field error and stores nothing', async () => {
    const tenantId = await seedTenant();

    const res = await put(tenantId, {
      legalName: 'Half',
      address: { city: 'Belo Horizonte' },
    }).expect(400);

    expect(res.body.code).toBe('ADDRESS_FIELD_REQUIRED');
    expect((await get(tenantId).expect(200)).body).toMatchObject({
      legalName: null,
      address: null,
    });
  });

  it('rejects a body the shared schema refuses with 400: a taxIdType alone, a null address', async () => {
    const tenantId = await seedTenant();

    await put(tenantId, { taxIdType: 'CPF' }).expect(400);
    await put(tenantId, { address: null }).expect(400);
  });

  it('keeps a BR tax id when an empty one is sent, and clears nothing else', async () => {
    const tenantId = await seedTenant({
      configure: (b) => b.withTaxId('CPF', CPF).withLegalName('Acme'),
    });

    const res = await put(tenantId, { taxId: '' }).expect(422);

    expect(res.body.code).toBe('BILLING_IDENTITY_TAX_ID_INVALID');
    expect((await get(tenantId).expect(200)).body).toMatchObject({ taxId: CPF, legalName: 'Acme' });
  });

  it('answers provisioning on a read and a retryable 503 on a save for a tenant with no account', async () => {
    const tenantId = await seedTenant({ account: false });

    expect((await get(tenantId).expect(200)).body).toEqual({ provisioning: true });
    expect((await put(tenantId, { legalName: 'x' }).expect(503)).body.code).toBe(
      'BILLING_PROVISIONING',
    );
  });

  it.each(['STAFF', 'CUSTOMER'] as const)(
    'refuses a %s token with 403, on read and save',
    async (role) => {
      const tenantId = await seedTenant();

      await get(tenantId, role).expect(403);
      await put(tenantId, { legalName: 'x' }, role).expect(403);
    },
  );

  it('is reachable by the manager of a SUSPENDED tenant, to read and to save', async () => {
    const tenantId = await seedTenant({ suspended: true });

    await get(tenantId).expect(200);
    await put(tenantId, { legalName: 'Back soon' }).expect(200);
    expect((await get(tenantId).expect(200)).body).toMatchObject({ legalName: 'Back soon' });
  });

  it('writes only the caller’s own tenant: the other tenant’s account is unchanged, byte for byte', async () => {
    const mine = await seedTenant({
      configure: (b) => b.withTaxId('CPF', CPF).withLegalName('Mine'),
    });
    const theirs = await seedTenant({
      configure: (b) => b.withTaxId('CPF', '11144477735').withLegalName('Theirs'),
    });
    const before = await ds
      .getRepository(BillingAccountEntity)
      .findOneByOrFail({ tenantId: theirs });

    await put(mine, { legalName: 'Mine, changed', address: ADDRESS }).expect(200);

    expect(
      await ds.getRepository(BillingAccountEntity).findOneByOrFail({ tenantId: theirs }),
    ).toEqual(before);
    expect((await get(theirs).expect(200)).body).toMatchObject({
      legalName: 'Theirs',
      taxId: '11144477735',
    });
    expect((await get(mine).expect(200)).body).toMatchObject({
      legalName: 'Mine, changed',
      taxId: CPF,
    });
  });

  it('never writes the tax id, legal name or email to a log line', async () => {
    const tenantId = await seedTenant();
    const lines: string[] = [];
    const write = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      lines.push(String(chunk));
      return true;
    });

    try {
      await put(tenantId, {
        taxId: CPF,
        legalName: 'Secret Legal Name',
        billingEmail: 'secret@acme.test',
      }).expect(200);
      await put(tenantId, { taxId: '123', billingEmail: 'secret2@acme.test' }).expect(422);
      await get(tenantId).expect(200);
    } finally {
      write.mockRestore();
    }

    const output = lines.join('');
    for (const secret of [CPF, 'Secret Legal Name', 'secret@acme.test', 'secret2@acme.test']) {
      expect(output).not.toContain(secret);
    }
  });
});
