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
      .set('X-Platform-Admin-Key', TEST_KEY)
      .send({
        name: 'Attach Tenant A',
        slug: 'attach-tenant-a',
        adminEmail: 'a@attach.test',
        country_code: 'BR',
      })
      .expect(201);
    tenantId = a.tenantId as string;

    const { body: b } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('X-Platform-Admin-Key', TEST_KEY)
      .send({
        name: 'Attach Tenant B',
        slug: 'attach-tenant-b',
        adminEmail: 'b@attach.test',
        country_code: 'BR',
      })
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
      .withPhone('+5531988888888')
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
        contactPhone: '+5531988888888',
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
    it('returns signedUrl + tmp/ staging filePath + expiresAt, regardless of whether a booking exists yet', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/bookings/attachments/signed-url')
        .set(actorHeaders(tenantId, STAFF_ID, 'MANAGER'))
        .send({ fileName: 'after.jpg', contentType: 'image/jpeg' })
        .expect(201);

      expect(body.signedUrl).toContain('http://fake-gcs/bucket/');
      expect(body.filePath).toMatch(new RegExp(`^tmp/${tenantId}/[^/]+/after\\.jpg$`));
      expect(body.expiresAt).toBeDefined();
    });

    it('returns 400 when fileName contains ".." without "/"', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/bookings/attachments/signed-url')
        .set(actorHeaders(tenantId, STAFF_ID, 'MANAGER'))
        .send({ fileName: 'bad..file.jpg', contentType: 'image/jpeg' })
        .expect(400);
      expect(body.status).toBe(400);
    });

    it('accepts contentType image/webp (client-side compressed upload)', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/bookings/attachments/signed-url')
        .set(actorHeaders(tenantId, STAFF_ID, 'MANAGER'))
        .send({ fileName: 'after.webp', contentType: 'image/webp' })
        .expect(201);

      expect(body.filePath).toMatch(new RegExp(`^tmp/${tenantId}/[^/]+/after\\.webp$`));
    });

    it('returns 400 for an unsupported contentType', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/bookings/attachments/signed-url')
        .set(actorHeaders(tenantId, STAFF_ID, 'MANAGER'))
        .send({ fileName: 'after.gif', contentType: 'image/gif' })
        .expect(400);
      expect(body.status).toBe(400);
    });

    it('ignores a stray bookingId from another tenant — filePath is still scoped to the caller tenant', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/bookings/attachments/signed-url')
        .set(actorHeaders(tenantBId, STAFF_ID, 'MANAGER'))
        .send({ fileName: 'after.jpg', contentType: 'image/jpeg', bookingId })
        .expect(201);

      expect(body.filePath).toMatch(new RegExp(`^tmp/${tenantBId}/[^/]+/after\\.jpg$`));
    });
  });
});
