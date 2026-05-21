import { INestApplication } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { TransactionManagerModule } from '../../../../shared/infrastructure/transaction-manager.module';
import { TenantInterceptor } from '../../../../shared/tenant/tenant.interceptor';
import { TenantModule } from '../../../../shared/tenant/tenant.module';
import { ServiceEntity } from '../entities/service.entity';
import { BookingModule } from '../../booking.module';

const TENANT_A = '10000000-0000-4000-8000-000000000200';
const TENANT_B = '10000000-0000-4000-8000-000000000201';
const MANAGER_ID = '20000000-0000-4000-8000-000000000001';

function actorHeaders(tenantId: string, actorId: string, role = 'MANAGER') {
  return {
    'x-tenant-id': tenantId,
    'x-actor-id': actorId,
    'x-actor-type': 'STAFF',
    'x-actor-role': role,
    'x-correlation-id': 'test-corr-svc',
  };
}

const validBody = {
  name: 'Lavagem Completa',
  description: 'Descrição completa',
  priceAmount: 150,
  durationMinutes: 60,
  loyaltyPointsValue: 10,
  requiresPickupAddress: false,
};

describe('ServiceController (integration) — POST /services', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: process.env['TEST_DATABASE_URL'],
          entities: [ServiceEntity],
          synchronize: false,
        }),
        TransactionManagerModule,
        TenantModule,
        BookingModule,
      ],
      providers: [{ provide: APP_INTERCEPTOR, useClass: TenantInterceptor }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    ds = moduleRef.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 201 with full service DTO including pt-BR formatted price', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/services')
      .set(actorHeaders(TENANT_A, MANAGER_ID))
      .send(validBody)
      .expect(201);

    expect(body.id).toBeDefined();
    expect(body.name).toBe('Lavagem Completa');
    expect(body.description).toBe('Descrição completa');
    expect(body.price.amount).toBe(150);
    expect(body.price.currency).toBe('BRL');
    expect(body.price.formatted).toBe('R$ 150,00');
    expect(body.durationMinutes).toBe(60);
    expect(body.loyaltyPointsValue).toBe(10);
    expect(body.isActive).toBe(true);
    expect(body.createdAt).toBeDefined();
  });

  it('persists the service with tenantId from TenantContext', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/services')
      .set(actorHeaders(TENANT_A, MANAGER_ID))
      .send(validBody)
      .expect(201);

    const row = await ds
      .getRepository(ServiceEntity)
      .findOne({ where: { id: body.id, tenantId: TENANT_A } });
    expect(row).not.toBeNull();
    expect(row!.tenantId).toBe(TENANT_A);
  });

  it('STAFF role can also create a service', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/services')
      .set(actorHeaders(TENANT_A, MANAGER_ID, 'STAFF'))
      .send(validBody)
      .expect(201);

    expect(body.id).toBeDefined();
  });

  it('returns 403 when CUSTOMER role is used', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/services')
      .set(actorHeaders(TENANT_A, MANAGER_ID, 'CUSTOMER'))
      .send(validBody)
      .expect(403);

    expect(body.status).toBe(403);
  });

  it('returns 400 when priceAmount is zero (domain invariant)', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/services')
      .set(actorHeaders(TENANT_A, MANAGER_ID))
      .send({ ...validBody, priceAmount: 0 })
      .expect(400);

    expect(body.status).toBe(400);
  });

  it('returns 400 when durationMinutes is zero (domain invariant)', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/services')
      .set(actorHeaders(TENANT_A, MANAGER_ID))
      .send({ ...validBody, durationMinutes: 0 })
      .expect(400);

    expect(body.status).toBe(400);
  });

  it('returns 403 when X-Actor-Role header is missing (StaffOrManagerRoleGuard fires before TenantInterceptor)', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/services')
      .send(validBody)
      .expect(403);

    expect(body.status).toBe(403);
  });

  it('tenant isolation: service created for Tenant A is not visible to Tenant B', async () => {
    const isolationTenant = '10000000-0000-4000-8000-000000000202';
    const { body } = await request(app.getHttpServer())
      .post('/services')
      .set(actorHeaders(isolationTenant, MANAGER_ID))
      .send(validBody)
      .expect(201);

    const rowInB = await ds
      .getRepository(ServiceEntity)
      .findOne({ where: { id: body.id, tenantId: TENANT_B } });
    expect(rowInB).toBeNull();
  });
});
