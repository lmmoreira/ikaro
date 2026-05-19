import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { EventBusModule } from '../../../../shared/infrastructure/event-bus.module';
import { TransactionManagerModule } from '../../../../shared/infrastructure/transaction-manager.module';
import { StaffEntityBuilder } from '../../../../test/builders/staff';
import { StaffEntity } from '../entities/staff.entity';
import { StaffModule } from '../../staff.module';

describe('InternalStaffController (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: process.env['TEST_DATABASE_URL'],
          entities: [StaffEntity],
          synchronize: false,
        }),
        EventBusModule,
        TransactionManagerModule,
        StaffModule,
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
    const { body } = await request(app.getHttpServer()).get('/internal/staff/by-oauth').expect(400);

    expect(body.status).toBe(400);
    expect(body.detail).toContain('googleOAuthId');
  });

  it('returns 404 when no staff is found for the given googleOAuthId', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/internal/staff/by-oauth?googleOAuthId=google-sub-m03s07-unknown')
      .expect(404);

    expect(body.status).toBe(404);
  });

  it('returns GetStaffByOAuthIdUseCaseResult for an active staff member', async () => {
    const entity = new StaffEntityBuilder()
      .withTenantId('00000000-0000-0000-0000-000000000050')
      .withGoogleOAuthId('google-sub-m03s07-active')
      .withEmail('gerente-m03s07@lavacar.com.br')
      .withRole('MANAGER')
      .withIsActive(true)
      .build();
    await ds.getRepository(StaffEntity).save(entity);

    const { body } = await request(app.getHttpServer())
      .get('/internal/staff/by-oauth?googleOAuthId=google-sub-m03s07-active')
      .expect(200);

    expect(body.staffId).toBe(entity.id);
    expect(body.tenantId).toBe('00000000-0000-0000-0000-000000000050');
    expect(body.role).toBe('MANAGER');
    expect(body.isActive).toBe(true);
  });

  it('returns isActive=false for a deactivated staff member', async () => {
    const entity = new StaffEntityBuilder()
      .withTenantId('00000000-0000-0000-0000-000000000051')
      .withGoogleOAuthId('google-sub-m03s07-inactive')
      .withEmail('deactivated-m03s07@lavacar.com.br')
      .withRole('STAFF')
      .withIsActive(false)
      .build();
    await ds.getRepository(StaffEntity).save(entity);

    const { body } = await request(app.getHttpServer())
      .get('/internal/staff/by-oauth?googleOAuthId=google-sub-m03s07-inactive')
      .expect(200);

    expect(body.isActive).toBe(false);
    expect(body.role).toBe('STAFF');
  });

  it('tenant isolation: different staff in different tenants are returned independently', async () => {
    const entityA = new StaffEntityBuilder()
      .withTenantId('00000000-0000-0000-0000-000000000052')
      .withGoogleOAuthId('google-sub-m03s07-iso-a')
      .withEmail('staff-a-m03s07@tenanta.com.br')
      .withIsActive(true)
      .build();
    await ds.getRepository(StaffEntity).save(entityA);

    const { body } = await request(app.getHttpServer())
      .get('/internal/staff/by-oauth?googleOAuthId=google-sub-m03s07-iso-a')
      .expect(200);

    expect(body.tenantId).toBe('00000000-0000-0000-0000-000000000052');
    expect(body.staffId).toBe(entityA.id);
  });

  describe('GET /internal/staff/by-email', () => {
    it('returns 400 when email or tenantId is absent', async () => {
      await request(app.getHttpServer())
        .get('/internal/staff/by-email?tenantId=10000000-0000-4000-8000-000000000060')
        .expect(400);

      await request(app.getHttpServer())
        .get('/internal/staff/by-email?email=staff@lavacar.com.br')
        .expect(400);
    });

    it('returns 404 when no staff found for given email + tenantId', async () => {
      const { body } = await request(app.getHttpServer())
        .get(
          '/internal/staff/by-email?email=nobody-m04s01@lavacar.com.br&tenantId=10000000-0000-4000-8000-000000000060',
        )
        .expect(404);

      expect(body.status).toBe(404);
    });

    it('returns GetStaffByEmailUseCaseResult for an invited (inactive) staff', async () => {
      const entity = new StaffEntityBuilder()
        .withTenantId('10000000-0000-4000-8000-000000000060')
        .withEmail('invited-m04s01@lavacar.com.br')
        .withRole('MANAGER')
        .withIsActive(false)
        .build();
      await ds.getRepository(StaffEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .get(
          '/internal/staff/by-email?email=invited-m04s01@lavacar.com.br&tenantId=10000000-0000-4000-8000-000000000060',
        )
        .expect(200);

      expect(body.staffId).toBe(entity.id);
      expect(body.email).toBe('invited-m04s01@lavacar.com.br');
      expect(body.role).toBe('MANAGER');
      expect(body.isActive).toBe(false);
    });

    it('tenant isolation: same email in different tenant returns 404', async () => {
      const entity = new StaffEntityBuilder()
        .withTenantId('10000000-0000-4000-8000-000000000061')
        .withEmail('iso-m04s01@lavacar.com.br')
        .withIsActive(false)
        .build();
      await ds.getRepository(StaffEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .get(
          '/internal/staff/by-email?email=iso-m04s01@lavacar.com.br&tenantId=10000000-0000-4000-8000-000000000099',
        )
        .expect(404);

      expect(body.status).toBe(404);
    });
  });

  describe('POST /internal/staff/:staffId/activate', () => {
    it('returns 404 when staffId does not exist', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/internal/staff/10000000-0000-4000-8000-000000009999/activate')
        .send({
          tenantId: '10000000-0000-4000-8000-000000000070',
          googleOAuthId: 'google-sub-m04s01-new',
          email: 'staff@lavacar.com.br',
          name: 'Staff User',
        })
        .expect(404);

      expect(body.status).toBe(404);
    });

    it('returns 422 when Google email does not match invited email', async () => {
      const entity = new StaffEntityBuilder()
        .withTenantId('10000000-0000-4000-8000-000000000070')
        .withEmail('invited-m04s01-act@lavacar.com.br')
        .withIsActive(false)
        .build();
      await ds.getRepository(StaffEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .post(`/internal/staff/${entity.id}/activate`)
        .send({
          tenantId: '10000000-0000-4000-8000-000000000070',
          googleOAuthId: 'google-sub-m04s01-act',
          email: 'wrong@gmail.com',
          name: 'Staff User',
        })
        .expect(422);

      expect(body.status).toBe(422);
    });

    it('activates staff, persists name, and returns 200 with result', async () => {
      const entity = new StaffEntityBuilder()
        .withTenantId('10000000-0000-4000-8000-000000000071')
        .withEmail('activate-m04s01@lavacar.com.br')
        .withRole('MANAGER')
        .withIsActive(false)
        .build();
      await ds.getRepository(StaffEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .post(`/internal/staff/${entity.id}/activate`)
        .send({
          tenantId: '10000000-0000-4000-8000-000000000071',
          googleOAuthId: 'google-sub-m04s01-activated',
          email: 'activate-m04s01@lavacar.com.br',
          name: 'Gerente Ativado',
        })
        .expect(200);

      expect(body.staffId).toBe(entity.id);
      expect(body.isActive).toBe(true);
      expect(body.role).toBe('MANAGER');
    });

    it('tenant isolation: cannot activate staff from a different tenant (404)', async () => {
      const entity = new StaffEntityBuilder()
        .withTenantId('10000000-0000-4000-8000-000000000072')
        .withEmail('iso-activate-m04s01@lavacar.com.br')
        .withIsActive(false)
        .build();
      await ds.getRepository(StaffEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .post(`/internal/staff/${entity.id}/activate`)
        .send({
          tenantId: '10000000-0000-4000-8000-000000000099',
          googleOAuthId: 'google-sub-m04s01-iso',
          email: 'iso-activate-m04s01@lavacar.com.br',
          name: 'Staff User',
        })
        .expect(404);

      expect(body.status).toBe(404);
    });
  });

  describe('GET /internal/staff', () => {
    it('returns 400 when tenantId is missing', async () => {
      const { body } = await request(app.getHttpServer()).get('/internal/staff').expect(400);

      expect(body.status ?? body.statusCode).toBe(400);
    });

    it('returns empty list when tenant has no staff', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/internal/staff?tenantId=10000000-0000-4000-8000-000000000080')
        .expect(200);

      expect(body.items).toHaveLength(0);
      expect(body.pagination.total).toBe(0);
      expect(body.pagination.hasMore).toBe(false);
    });

    it('returns staff for the given tenant with pagination metadata', async () => {
      const tenantId = '10000000-0000-4000-8000-000000000081';
      const e1 = new StaffEntityBuilder()
        .withTenantId(tenantId)
        .withEmail('list1-m04s02@lavacar.com.br')
        .withRole('MANAGER')
        .withIsActive(false)
        .build();
      const e2 = new StaffEntityBuilder()
        .withTenantId(tenantId)
        .withEmail('list2-m04s02@lavacar.com.br')
        .withIsActive(false)
        .build();
      await ds.getRepository(StaffEntity).save(e1);
      await ds.getRepository(StaffEntity).save(e2);

      const { body } = await request(app.getHttpServer())
        .get(`/internal/staff?tenantId=${tenantId}`)
        .expect(200);

      expect(body.items.length).toBeGreaterThanOrEqual(2);
      expect(body.items.every((i: { tenantId?: string }) => i.tenantId === undefined)).toBe(true);
      expect(body.pagination.total).toBeGreaterThanOrEqual(2);
    });

    it('tenant isolation: does not return staff from other tenants', async () => {
      const tenantA = '10000000-0000-4000-8000-000000000082';
      const tenantB = '10000000-0000-4000-8000-000000000083';

      const eA = new StaffEntityBuilder()
        .withTenantId(tenantA)
        .withEmail('iso-list-a-m04s02@lavacar.com.br')
        .withIsActive(false)
        .build();
      const eB = new StaffEntityBuilder()
        .withTenantId(tenantB)
        .withEmail('iso-list-b-m04s02@lavacar.com.br')
        .withIsActive(false)
        .build();
      await ds.getRepository(StaffEntity).save(eA);
      await ds.getRepository(StaffEntity).save(eB);

      const { body } = await request(app.getHttpServer())
        .get(`/internal/staff?tenantId=${tenantA}`)
        .expect(200);

      expect(body.items.every((i: { id: string }) => i.id !== eB.id)).toBe(true);
    });
  });

  describe('GET /internal/staff/:id', () => {
    it('returns 400 when tenantId is missing', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/internal/staff/10000000-0000-4000-8000-000000000090')
        .expect(400);

      expect(body.status ?? body.statusCode).toBe(400);
    });

    it('returns 404 when staff does not exist', async () => {
      const { body } = await request(app.getHttpServer())
        .get(
          '/internal/staff/10000000-0000-4000-8000-000000000099?tenantId=10000000-0000-4000-8000-000000000090',
        )
        .expect(404);

      expect(body.status).toBe(404);
    });

    it('returns staff member with correct shape', async () => {
      const tenantId = '10000000-0000-4000-8000-000000000090';
      const entity = new StaffEntityBuilder()
        .withTenantId(tenantId)
        .withEmail('detail-m04s02@lavacar.com.br')
        .withRole('MANAGER')
        .withIsActive(false)
        .build();
      await ds.getRepository(StaffEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .get(`/internal/staff/${entity.id}?tenantId=${tenantId}`)
        .expect(200);

      expect(body.id).toBe(entity.id);
      expect(body.email).toBe('detail-m04s02@lavacar.com.br');
      expect(body.role).toBe('MANAGER');
      expect(body.isActive).toBe(false);
      expect(body.name).toBeNull();
    });

    it('tenant isolation: returns 404 for staff belonging to another tenant', async () => {
      const tenantA = '10000000-0000-4000-8000-000000000091';
      const tenantB = '10000000-0000-4000-8000-000000000092';

      const entity = new StaffEntityBuilder()
        .withTenantId(tenantA)
        .withEmail('iso-detail-m04s02@lavacar.com.br')
        .withIsActive(false)
        .build();
      await ds.getRepository(StaffEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .get(`/internal/staff/${entity.id}?tenantId=${tenantB}`)
        .expect(404);

      expect(body.status).toBe(404);
    });
  });

  describe('POST /internal/staff/invite', () => {
    const tenantId = '10000000-0000-4000-8000-000000000093';
    const invitedBy = '20000000-0000-4000-8000-000000000001';

    it('creates an inactive staff row and returns 201', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/internal/staff/invite')
        .send({
          tenantId,
          email: 'invite-m04s03@lavacar.com.br',
          firstName: 'João',
          lastName: 'Silva',
          role: 'STAFF',
          invitedBy,
        })
        .expect(201);

      expect(body.email).toBe('invite-m04s03@lavacar.com.br');
      expect(body.role).toBe('STAFF');
      expect(body.isActive).toBe(false);
      expect(body.staffId).toBeDefined();

      const row = await ds
        .getRepository(StaffEntity)
        .findOne({ where: { id: body.staffId, tenantId } });
      expect(row).not.toBeNull();
      expect(row!.isActive).toBe(false);
      expect(row!.googleOAuthId).toBeNull();
    });

    it('returns 409 when email is already active in the same tenant', async () => {
      const entity = new StaffEntityBuilder()
        .withTenantId(tenantId)
        .withEmail('active-m04s03@lavacar.com.br')
        .withGoogleOAuthId('google-sub-m04s03-active')
        .withIsActive(true)
        .build();
      await ds.getRepository(StaffEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .post('/internal/staff/invite')
        .send({
          tenantId,
          email: 'active-m04s03@lavacar.com.br',
          firstName: 'Maria',
          lastName: 'Costa',
          role: 'STAFF',
          invitedBy,
        })
        .expect(409);

      expect(body.status).toBe(409);
    });

    it('resends invite for an inactive staff row without creating a duplicate', async () => {
      const entity = new StaffEntityBuilder()
        .withTenantId(tenantId)
        .withEmail('inactive-m04s03@lavacar.com.br')
        .withIsActive(false)
        .build();
      await ds.getRepository(StaffEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .post('/internal/staff/invite')
        .send({
          tenantId,
          email: 'inactive-m04s03@lavacar.com.br',
          firstName: 'Ana',
          lastName: 'Souza',
          role: 'STAFF',
          invitedBy,
        })
        .expect(201);

      expect(body.staffId).toBe(entity.id);

      const count = await ds
        .getRepository(StaffEntity)
        .count({ where: { tenantId, email: 'inactive-m04s03@lavacar.com.br' } });
      expect(count).toBe(1);
    });

    it('tenant isolation: invited staff row carries the correct tenantId', async () => {
      const tenantX = '10000000-0000-4000-8000-000000000094';
      const tenantY = '10000000-0000-4000-8000-000000000095';

      await request(app.getHttpServer())
        .post('/internal/staff/invite')
        .send({
          tenantId: tenantX,
          email: 'iso-invite-m04s03@lavacar.com.br',
          firstName: 'Carlos',
          lastName: 'Lima',
          role: 'MANAGER',
          invitedBy,
        })
        .expect(201);

      const rowInY = await ds
        .getRepository(StaffEntity)
        .findOne({ where: { tenantId: tenantY, email: 'iso-invite-m04s03@lavacar.com.br' } });
      expect(rowInY).toBeNull();
    });

    it('returns 400 when required fields are missing', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/internal/staff/invite')
        .send({ tenantId, email: 'bad-m04s03@lavacar.com.br' })
        .expect(400);

      expect(body.status).toBe(400);
    });
  });
});
