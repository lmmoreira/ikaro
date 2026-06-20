import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { CustomerEntityBuilder } from '../../../../test/builders/customer/index';
import { actorHeaders } from '../../../../test/utils/actor-headers';
import { createCustomerIntegrationApp } from '../../../../test/utils/customer-integration-app';
import { CustomerEntity } from '../entities/customer.entity';

const TEST_KEY = 'customer-integ-test-key-customer-xxx'; // 36 chars

describe('CustomerController (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let tenantAId: string;
  let tenantBId: string;

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = TEST_KEY;
    ({ app, ds } = await createCustomerIntegrationApp());

    const { body: a } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('Authorization', `Bearer ${TEST_KEY}`)
      .send({
        name: 'Customer Tenant A',
        slug: 'cust-tenant-a',
        adminEmail: 'a@cust.test',
        country_code: 'BR',
      })
      .expect(201);
    tenantAId = a.tenantId as string;

    const { body: b } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('Authorization', `Bearer ${TEST_KEY}`)
      .send({
        name: 'Customer Tenant B',
        slug: 'cust-tenant-b',
        adminEmail: 'b@cust.test',
        country_code: 'BR',
      })
      .expect(201);
    tenantBId = b.tenantId as string;
  });

  afterAll(async () => {
    delete process.env['PLATFORM_ADMIN_KEY'];
    await app.close();
  });

  describe('GET /customers/me', () => {
    let customerId: string;

    beforeAll(async () => {
      const entity = new CustomerEntityBuilder()
        .withTenantId(tenantAId)
        .withEmail('getme@profile.test')
        .withName('Get Me Customer')
        .withPhone('+5531999999999')
        .build();
      await ds.getRepository(CustomerEntity).save(entity);
      customerId = entity.id;
    });

    it('returns the customer profile for the authenticated actor', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/customers/me')
        .set(actorHeaders(tenantAId, customerId, 'CUSTOMER'))
        .expect(200);

      expect(body.customerId).toBe(customerId);
      expect(body.email).toBe('getme@profile.test');
      expect(body.name).toBe('Get Me Customer');
      expect(body.phone).toBe('+5531999999999');
      expect(body.defaultAddress).toBeNull();
    });

    it('returns 404 when actorId has no customer in this tenant', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/customers/me')
        .set(actorHeaders(tenantAId, '00000000-0000-4000-8000-000000009996', 'CUSTOMER'))
        .expect(404);

      expect(body.status).toBe(404);
    });

    it('tenant isolation: customer from tenant A is not found under tenant B context', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/customers/me')
        .set(actorHeaders(tenantBId, customerId, 'CUSTOMER'))
        .expect(404);

      expect(body.status).toBe(404);
    });
  });

  describe('PATCH /customers/me', () => {
    let customerId: string;

    beforeEach(async () => {
      const entity = new CustomerEntityBuilder()
        .withTenantId(tenantAId)
        .withGoogleOAuthId(`google-patch-${uuidv7()}`)
        .withEmail('patchme@profile.test')
        .withName('Original Name')
        .withPhone(null)
        .build();
      await ds.getRepository(CustomerEntity).save(entity);
      customerId = entity.id;
    });

    it('updates name, phone, and defaultAddress', async () => {
      const { body } = await request(app.getHttpServer())
        .patch('/customers/me')
        .set(actorHeaders(tenantAId, customerId, 'CUSTOMER'))
        .send({
          name: 'Updated Name',
          phone: '+5531988888888',
          defaultAddress: {
            street: 'Rua das Flores',
            number: '10',
            neighborhood: 'Centro',
            city: 'Belo Horizonte',
            state: 'MG',
            zipCode: '30100000',
          },
        })
        .expect(200);

      expect(body.name).toBe('Updated Name');
      expect(body.phone).toBe('+5531988888888');
      expect(body.defaultAddress.city).toBe('Belo Horizonte');
      expect(body.defaultAddress.zipCode).toBe('30100000');

      const row = await ds.getRepository(CustomerEntity).findOne({ where: { id: customerId } });
      expect(row!.name).toBe('Updated Name');
      expect(row!.phone).toBe('+5531988888888');
    });

    it('partial update: leaves unspecified fields unchanged', async () => {
      await request(app.getHttpServer())
        .patch('/customers/me')
        .set(actorHeaders(tenantAId, customerId, 'CUSTOMER'))
        .send({ phone: '+5531977777777' })
        .expect(200);

      const { body } = await request(app.getHttpServer())
        .patch('/customers/me')
        .set(actorHeaders(tenantAId, customerId, 'CUSTOMER'))
        .send({ name: 'Only Name Changed' })
        .expect(200);

      expect(body.name).toBe('Only Name Changed');
      expect(body.phone).toBe('+5531977777777');
    });

    it('clears defaultAddress when set to null', async () => {
      await request(app.getHttpServer())
        .patch('/customers/me')
        .set(actorHeaders(tenantAId, customerId, 'CUSTOMER'))
        .send({
          defaultAddress: {
            street: 'Rua A',
            number: '1',
            neighborhood: 'B',
            city: 'C',
            state: 'MG',
            zipCode: '30100000',
          },
        })
        .expect(200);

      const { body } = await request(app.getHttpServer())
        .patch('/customers/me')
        .set(actorHeaders(tenantAId, customerId, 'CUSTOMER'))
        .send({ defaultAddress: null })
        .expect(200);

      expect(body.defaultAddress).toBeNull();
    });

    it('stores zipCode with hyphen as provided (no normalisation)', async () => {
      const { body } = await request(app.getHttpServer())
        .patch('/customers/me')
        .set(actorHeaders(tenantAId, customerId, 'CUSTOMER'))
        .send({
          defaultAddress: {
            street: 'Rua B',
            number: '2',
            neighborhood: 'C',
            city: 'D',
            state: 'MG',
            zipCode: '30130-921',
          },
        })
        .expect(200);

      expect(body.defaultAddress.zipCode).toBe('30130-921');
    });

    it('returns 400 for invalid phone', async () => {
      const { body } = await request(app.getHttpServer())
        .patch('/customers/me')
        .set(actorHeaders(tenantAId, customerId, 'CUSTOMER'))
        .send({ phone: '123' })
        .expect(400);

      expect(body.status).toBe(400);
    });

    it('tenant isolation: cannot update customer from tenant A via tenant B context', async () => {
      const { body } = await request(app.getHttpServer())
        .patch('/customers/me')
        .set(actorHeaders(tenantBId, customerId, 'CUSTOMER'))
        .send({ name: 'Hacked' })
        .expect(404);

      expect(body.status).toBe(404);
    });
  });
});
