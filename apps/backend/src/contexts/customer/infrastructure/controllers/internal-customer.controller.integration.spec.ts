import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { CustomerEntityBuilder } from '../../../../test/builders/customer';
import { CustomerEntity } from '../entities/customer.entity';
import { CustomerModule } from '../../customer.module';

describe('InternalCustomerController (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: process.env['TEST_DATABASE_URL'],
          entities: [CustomerEntity],
          synchronize: false,
        }),
        CustomerModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    ds = moduleRef.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 400 when googleOAuthId query param is absent', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/internal/customers/tenants')
      .expect(400);

    expect(body.status).toBe(400);
    expect(body.detail).toContain('googleOAuthId');
  });

  it('returns empty array when no customer records exist for the given googleOAuthId', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/internal/customers/tenants?googleOAuthId=no-such-sub')
      .expect(200);

    expect(body).toEqual([]);
  });

  it('returns the customer tenant entries for a known googleOAuthId', async () => {
    const tenantId = '00000000-0000-0000-0000-000000000020';
    const entity = new CustomerEntityBuilder()
      .withTenantId(tenantId)
      .withGoogleOAuthId('google-sub-m03s06-01')
      .withEmail('joao-m03s06@lavacar.com.br')
      .build();
    await ds.getRepository(CustomerEntity).save(entity);

    const { body } = await request(app.getHttpServer())
      .get('/internal/customers/tenants?googleOAuthId=google-sub-m03s06-01')
      .expect(200);

    expect(body).toHaveLength(1);
    expect(body[0].tenantId).toBe(tenantId);
    expect(body[0].customerId).toBe(entity.id);
  });

  it('tenant isolation: returns only entries for the specified googleOAuthId', async () => {
    const entity1 = new CustomerEntityBuilder()
      .withTenantId('00000000-0000-0000-0000-000000000021')
      .withGoogleOAuthId('google-sub-m03s06-alice')
      .withEmail('alice-m03s06@lavacar.com.br')
      .build();
    const entity2 = new CustomerEntityBuilder()
      .withTenantId('00000000-0000-0000-0000-000000000022')
      .withGoogleOAuthId('google-sub-m03s06-bob')
      .withEmail('bob-m03s06@lavacar.com.br')
      .build();
    await ds.getRepository(CustomerEntity).save([entity1, entity2]);

    const { body } = await request(app.getHttpServer())
      .get('/internal/customers/tenants?googleOAuthId=google-sub-m03s06-alice')
      .expect(200);

    expect(body).toHaveLength(1);
    expect(body[0].tenantId).toBe('00000000-0000-0000-0000-000000000021');
  });

  describe('GET /internal/customers/:customerId/tenants', () => {
    it('returns 400 when tenantId query param is absent', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/internal/customers/10000000-0000-4000-8000-000000000001/tenants')
        .expect(400);

      expect(body.status).toBe(400);
      expect(body.detail).toContain('tenantId');
    });

    it('returns 404 when no customer exists for the given customerId + tenantId', async () => {
      const { body } = await request(app.getHttpServer())
        .get(
          '/internal/customers/10000000-0000-4000-8000-000000000099/tenants?tenantId=00000000-0000-0000-0000-000000000099',
        )
        .expect(404);

      expect(body.status).toBe(404);
    });

    it('returns all tenants for the customer identified by (customerId, tenantId)', async () => {
      const sub = 'google-sub-m03s08-switch';
      const tenantA = '00000000-0000-0000-0000-000000000060';
      const tenantB = '00000000-0000-0000-0000-000000000061';

      const entityA = new CustomerEntityBuilder()
        .withTenantId(tenantA)
        .withGoogleOAuthId(sub)
        .withEmail('switch-a-m03s08@lavacar.com.br')
        .build();
      const entityB = new CustomerEntityBuilder()
        .withTenantId(tenantB)
        .withGoogleOAuthId(sub)
        .withEmail('switch-b-m03s08@lavacar.com.br')
        .build();
      await ds.getRepository(CustomerEntity).save([entityA, entityB]);

      const { body } = await request(app.getHttpServer())
        .get(`/internal/customers/${entityA.id}/tenants?tenantId=${tenantA}`)
        .expect(200);

      expect(body).toHaveLength(2);
      const tenantIds = (body as { tenantId: string }[]).map((r) => r.tenantId);
      expect(tenantIds).toContain(tenantA);
      expect(tenantIds).toContain(tenantB);
    });

    it('tenant isolation: 404 when customerId belongs to a different tenant', async () => {
      const entity = new CustomerEntityBuilder()
        .withTenantId('00000000-0000-0000-0000-000000000062')
        .withGoogleOAuthId('google-sub-m03s08-iso')
        .withEmail('iso-m03s08@lavacar.com.br')
        .build();
      await ds.getRepository(CustomerEntity).save(entity);

      await request(app.getHttpServer())
        .get(
          `/internal/customers/${entity.id}/tenants?tenantId=00000000-0000-0000-0000-000000000099`,
        )
        .expect(404);
    });
  });

  it('returns multiple entries when the same googleOAuthId exists in multiple tenants', async () => {
    const sub = 'google-sub-m03s06-multi';
    const entityA = new CustomerEntityBuilder()
      .withTenantId('00000000-0000-0000-0000-000000000023')
      .withGoogleOAuthId(sub)
      .withEmail('multi-a-m03s06@lavacar.com.br')
      .build();
    const entityB = new CustomerEntityBuilder()
      .withTenantId('00000000-0000-0000-0000-000000000024')
      .withGoogleOAuthId(sub)
      .withEmail('multi-b-m03s06@lavacar.com.br')
      .build();
    await ds.getRepository(CustomerEntity).save([entityA, entityB]);

    const { body } = await request(app.getHttpServer())
      .get(`/internal/customers/tenants?googleOAuthId=${sub}`)
      .expect(200);

    expect(body).toHaveLength(2);
    const tenantIds = (body as { tenantId: string }[]).map((r) => r.tenantId);
    expect(tenantIds).toContain('00000000-0000-0000-0000-000000000023');
    expect(tenantIds).toContain('00000000-0000-0000-0000-000000000024');
  });
});
