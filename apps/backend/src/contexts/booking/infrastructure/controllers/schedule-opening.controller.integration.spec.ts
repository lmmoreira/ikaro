import { INestApplication } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { TransactionManagerModule } from '../../../../shared/infrastructure/transaction-manager.module';
import { TenantInterceptor } from '../../../../shared/tenant/tenant.interceptor';
import { TenantModule } from '../../../../shared/tenant/tenant.module';
import { ScheduleOpeningEntityBuilder } from '../../../../test/builders/booking/index';
import { TenantEntityBuilder } from '../../../../test/builders/platform/tenant-entity.builder';
import { actorHeaders } from '../../../../test/utils/actor-headers';
import { futureDate, nextWeekday, pastDate } from '../../../../test/utils/date-helpers';
import { TenantEntity } from '../../../platform/infrastructure/entities/tenant.entity';
import { ScheduleClosureEntity } from '../entities/schedule-closure.entity';
import { ScheduleOpeningEntity } from '../entities/schedule-opening.entity';
import { ServiceEntity } from '../entities/service.entity';
import { BookingModule } from '../../booking.module';

const TENANT_A = '10000000-0000-4000-8000-000000000400';
const TENANT_B = '10000000-0000-4000-8000-000000000401';
const MANAGER_ID = '20000000-0000-4000-8000-000000000001';

// Default TenantSettings has sunday=null (closed) and Mon–Sat open.
const CLOSED_DAY = nextWeekday(0); // Sunday
const OPEN_DAY = nextWeekday(1); // Monday — already open in business_hours

describe('ScheduleOpeningController (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: process.env['TEST_DATABASE_URL'],
          entities: [ServiceEntity, ScheduleClosureEntity, ScheduleOpeningEntity, TenantEntity],
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

    // Seed tenants so GetTenantSettingsUseCase can resolve business_hours
    const tenantRepo = ds.getRepository(TenantEntity);
    await tenantRepo.save(
      new TenantEntityBuilder().withId(TENANT_A).withSlug('tenant-a-400').build(),
    );
    await tenantRepo.save(
      new TenantEntityBuilder().withId(TENANT_B).withSlug('tenant-b-401').build(),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── POST /schedule/openings ─────────────────────────────────────────────────

  describe('POST /schedule/openings', () => {
    it('creates an opening for a normally-closed day and returns 201', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/schedule/openings')
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .send({ date: CLOSED_DAY, startTime: '09:00', endTime: '14:00' })
        .expect(201);

      expect(body.id).toBeDefined();
      expect(body.date).toBe(CLOSED_DAY);
      expect(body.startTime).toBe('09:00');
      expect(body.endTime).toBe('14:00');
    });

    it('returns 422 for a past date', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/schedule/openings')
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .send({ date: pastDate(), startTime: '09:00', endTime: '14:00' })
        .expect(422);

      expect(body.status).toBe(422);
    });

    it('returns 422 when day is already open in business_hours', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/schedule/openings')
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .send({ date: OPEN_DAY, startTime: '09:00', endTime: '14:00' })
        .expect(422);

      expect(body.status).toBe(422);
    });

    it('returns 409 when an opening already exists for that date', async () => {
      const date = nextWeekday(0, 2); // use a different Sunday to avoid collision with the 201 test
      await request(app.getHttpServer())
        .post('/schedule/openings')
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .send({ date, startTime: '09:00', endTime: '14:00' })
        .expect(201);

      const { body } = await request(app.getHttpServer())
        .post('/schedule/openings')
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .send({ date, startTime: '10:00', endTime: '13:00' })
        .expect(409);

      expect(body.status).toBe(409);
    });

    it('returns 403 for CUSTOMER role', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/schedule/openings')
        .set(actorHeaders(TENANT_A, MANAGER_ID, 'CUSTOMER'))
        .send({ date: futureDate(30), startTime: '09:00', endTime: '14:00' })
        .expect(403);

      expect(body).toBeDefined();
    });
  });

  // ─── DELETE /schedule/openings/:id ──────────────────────────────────────────

  describe('DELETE /schedule/openings/:id', () => {
    it('removes an opening and returns 204', async () => {
      const entity = new ScheduleOpeningEntityBuilder()
        .withTenantId(TENANT_A)
        .withDate(futureDate(15))
        .build();
      await ds.getRepository(ScheduleOpeningEntity).save(entity);

      await request(app.getHttpServer())
        .delete(`/schedule/openings/${entity.id}`)
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .expect(204);

      const found = await ds
        .getRepository(ScheduleOpeningEntity)
        .findOne({ where: { id: entity.id } });
      expect(found).toBeNull();
    });

    it('returns 404 when opening does not exist', async () => {
      const { body } = await request(app.getHttpServer())
        .delete('/schedule/openings/00000000-0000-4000-8000-000000000099')
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .expect(404);

      expect(body.status).toBe(404);
    });

    it('tenant isolation: cannot delete an opening from another tenant', async () => {
      const entity = new ScheduleOpeningEntityBuilder()
        .withTenantId(TENANT_B)
        .withDate(futureDate(16))
        .build();
      await ds.getRepository(ScheduleOpeningEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .delete(`/schedule/openings/${entity.id}`)
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .expect(404);

      expect(body.status).toBe(404);
    });
  });

  // ─── GET /schedule/openings ──────────────────────────────────────────────────

  describe('GET /schedule/openings', () => {
    const LIST_TENANT = '10000000-0000-4000-8000-000000000402';

    beforeAll(async () => {
      const repo = ds.getRepository(ScheduleOpeningEntity);
      await repo.save(
        new ScheduleOpeningEntityBuilder().withTenantId(LIST_TENANT).withDate('2026-10-05').build(),
      );
      await repo.save(
        new ScheduleOpeningEntityBuilder().withTenantId(LIST_TENANT).withDate('2026-10-19').build(),
      );
    });

    it('returns all openings in range sorted by date', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/schedule/openings?from=2026-10-01&to=2026-10-31')
        .set(actorHeaders(LIST_TENANT, MANAGER_ID))
        .expect(200);

      expect(body.items).toHaveLength(2);
      expect(body.items[0].date).toBe('2026-10-05');
      expect(body.items[1].date).toBe('2026-10-19');
    });

    it('does not return openings from another tenant', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/schedule/openings?from=2026-10-01&to=2026-10-31')
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .expect(200);

      expect(
        body.items.every((i: { date: string }) => !['2026-10-05', '2026-10-19'].includes(i.date)),
      ).toBe(true);
    });
  });
});
