import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { ServiceEntityBuilder } from '../../../../test/builders/booking/index';
import { CustomerEntityBuilder } from '../../../../test/builders/customer/index';
import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { actorHeaders } from '../../../../test/utils/actor-headers';
import { futureDate } from '../../../../test/utils/date-helpers';
import { createBookingIntegrationApp } from '../../../../test/utils/booking-integration-app';
import { STORAGE_SERVICE } from '../../../../shared/ports/storage.service.port';
import { PlatformModule } from '../../../platform/platform.module';
import { CustomerEntity } from '../../../customer/infrastructure/entities/customer.entity';
import { ServiceEntity } from '../entities/service.entity';
import { BookingEntity } from '../entities/booking.entity';
import { BookingLineEntity } from '../entities/booking-line.entity';

const TEST_KEY = 'attach-integ-test-key-booking-xxxx'; // 36 chars
const STAFF_ID = '20000000-0000-4000-8000-000000000501';

describe('BookingAttachmentsController (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let tenantId: string;
  let tenantBId: string;
  let bookingId: string;
  let serviceId: string;
  let storageService: InMemoryStorageService;

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = TEST_KEY;

    storageService = new InMemoryStorageService();

    ({ app, ds } = await createBookingIntegrationApp({
      extraModules: [PlatformModule],
      overrideProviders: [{ provide: STORAGE_SERVICE, useValue: storageService }],
    }));

    const { body: a } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('Authorization', `Bearer ${TEST_KEY}`)
      .send({ name: 'Attach Tenant A', slug: 'attach-tenant-a', adminEmail: 'a@attach.test',
      country_code: 'BR' })
      .expect(201);
    tenantId = a.tenantId as string;

    const { body: b } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('Authorization', `Bearer ${TEST_KEY}`)
      .send({ name: 'Attach Tenant B', slug: 'attach-tenant-b', adminEmail: 'b@attach.test',
      country_code: 'BR' })
      .expect(201);
    tenantBId = b.tenantId as string;

    const svc = new ServiceEntityBuilder()
      .withTenantId(tenantId)
      .withName('Lavagem')
      .withPriceAmount('50.00')
      .build();
    await ds.getRepository(ServiceEntity).save(svc);
    serviceId = svc.id;

    const cust = new CustomerEntityBuilder()
      .withTenantId(tenantId)
      .withEmail('joao@test.com')
      .withName('João')
      .withPhone('31988888888')
      .build();
    await ds.getRepository(CustomerEntity).save(cust);

    const { body: bk } = await request(app.getHttpServer())
      .post('/bookings')
      .set({ 'x-tenant-id': tenantId, 'x-correlation-id': 'corr-attach-integ' })
      .send({
        serviceIds: [serviceId],
        scheduledAt: `${futureDate(3)}T09:00:00.000Z`,
        contactName: 'João',
        contactEmail: 'joao@test.com',
        contactPhone: '31988888888',
      })
      .expect(201);
    bookingId = bk.bookingId as string;
  });

  afterAll(async () => {
    await ds.getRepository(BookingLineEntity).delete({ tenantId });
    await ds.getRepository(BookingEntity).delete({ tenantId });
    await ds.getRepository(ServiceEntity).delete({ tenantId });
    await ds.getRepository(CustomerEntity).delete({ tenantId });
    await app.close();
  });

  describe('POST /bookings/attachments/signed-url', () => {
    it('scenario 4 — staff with bookingId: returns signedUrl + bookings/ filePath + expiresAt', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/bookings/attachments/signed-url')
        .set(actorHeaders(tenantId, STAFF_ID, 'MANAGER'))
        .send({ fileName: 'after.jpg', contentType: 'image/jpeg', bookingId })
        .expect(201);

      expect(body.signedUrl).toContain('http://fake-gcs/bucket/');
      expect(body.filePath).toBe(`tenants/${tenantId}/bookings/${bookingId}/after.jpg`);
      expect(body.expiresAt).toBeDefined();
    });

    it('scenario 1 — no bookingId: returns signedUrl with uploads/ filePath', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/bookings/attachments/signed-url')
        .set(actorHeaders(tenantId, STAFF_ID, 'MANAGER'))
        .send({ fileName: 'before.jpg', contentType: 'image/jpeg' })
        .expect(201);

      expect(body.filePath).toMatch(/^tenants\/[^/]+\/uploads\/[^/]+\/before\.jpg$/);
    });

    it('returns 400 when fileName contains ".." without "/"', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/bookings/attachments/signed-url')
        .set(actorHeaders(tenantId, STAFF_ID, 'MANAGER'))
        .send({ fileName: 'bad..file.jpg', contentType: 'image/jpeg' })
        .expect(400);
      expect(body.status).toBe(400);
    });

    it('returns 404 when bookingId belongs to a different tenant (tenant isolation)', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/bookings/attachments/signed-url')
        .set(actorHeaders(tenantBId, STAFF_ID, 'MANAGER'))
        .send({ fileName: 'after.jpg', contentType: 'image/jpeg', bookingId })
        .expect(404);
      expect(body.status).toBe(404);
    });
  });
});
