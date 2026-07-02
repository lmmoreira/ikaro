import { HttpException, INestApplication } from '@nestjs/common';
import { MockBackendHttpService, createTestApp, request } from '../../test/component-test.helpers';
import { AvailabilityResponse } from './schedule.types';

const TENANT_SLUG = 'lavacar-test';
const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const SERVICE_ID = '00000000-0000-4000-8000-000000000001';
const DATE = '2026-06-09';

const mockAvailability: AvailabilityResponse = {
  date: DATE,
  slots: [{ startsAt: `${DATE}T12:00:00.000Z`, endsAt: `${DATE}T13:00:00.000Z` }],
  available: true,
};

describe('ScheduleAvailabilityController (component)', () => {
  let app: INestApplication;
  let backendHttpService: MockBackendHttpService;
  let restoreEnv: () => void;

  beforeAll(async () => {
    ({ app, backendHttpService, restoreEnv } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
    restoreEnv();
  });

  afterEach(() => jest.resetAllMocks());

  const availabilityUrl = `/v1/schedule/availability?date=${DATE}&serviceIds=${SERVICE_ID}`;

  // ─── Public endpoint — no JWT required ──────────────────────────────────────

  it('returns 400 when X-Tenant-Slug header is missing', async () => {
    const res = await request(app.getHttpServer()).get(availabilityUrl);

    expect(res.status).toBe(400);
  });

  it('returns 400 when date param is malformed (Zod validation)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/schedule/availability?date=not-a-date&serviceIds=${SERVICE_ID}`)
      .set('x-tenant-slug', TENANT_SLUG);

    expect(res.status).toBe(400);
  });

  it('returns 400 when serviceIds param is missing (Zod validation)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/schedule/availability?date=${DATE}`)
      .set('x-tenant-slug', TENANT_SLUG);

    expect(res.status).toBe(400);
  });

  it('returns 200 with availability data for a valid public request', async () => {
    backendHttpService.get.mockResolvedValueOnce({ id: TENANT_ID });
    backendHttpService.getForPublic.mockResolvedValueOnce(mockAvailability);

    const res = await request(app.getHttpServer())
      .get(availabilityUrl)
      .set('x-tenant-slug', TENANT_SLUG);

    expect(res.status).toBe(200);
    expect(res.body.available).toBe(true);
    expect(res.body.slots).toHaveLength(1);
    expect(res.body.date).toBe(DATE);
  });

  it('works without any JWT token (public endpoint)', async () => {
    backendHttpService.get.mockResolvedValueOnce({ id: TENANT_ID });
    backendHttpService.getForPublic.mockResolvedValueOnce({
      date: DATE,
      slots: [],
      available: false,
    });

    const res = await request(app.getHttpServer())
      .get(availabilityUrl)
      .set('x-tenant-slug', TENANT_SLUG);
    // No Authorization header — must still succeed (200, not 401)
    expect(res.status).toBe(200);
    expect(res.body.available).toBe(false);
  });

  it('propagates backend 422 for past date', async () => {
    backendHttpService.get.mockResolvedValueOnce({ id: TENANT_ID });
    backendHttpService.getForPublic.mockRejectedValueOnce(
      new HttpException({ title: 'Unprocessable Entity', status: 422 }, 422),
    );

    const res = await request(app.getHttpServer())
      .get(`/v1/schedule/availability?date=2020-01-01&serviceIds=${SERVICE_ID}`)
      .set('x-tenant-slug', TENANT_SLUG);

    expect(res.status).toBe(422);
  });

  it('propagates backend 400 for invalid serviceId', async () => {
    backendHttpService.get.mockResolvedValueOnce({ id: TENANT_ID });
    backendHttpService.getForPublic.mockRejectedValueOnce(
      new HttpException({ title: 'Bad Request', status: 400 }, 400),
    );

    const res = await request(app.getHttpServer())
      .get(availabilityUrl)
      .set('x-tenant-slug', TENANT_SLUG);

    expect(res.status).toBe(400);
  });
});
