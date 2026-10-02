import { HttpException, INestApplication } from '@nestjs/common';
import { MockBackendHttpService, createTestApp, request } from '../../test/component-test.helpers';
import { AvailabilitySummaryResponse } from './schedule.types';

const TENANT_SLUG = 'lavacar-test';
const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const SERVICE_ID = '00000000-0000-4000-8000-000000000001';
const FROM = '2026-06-09';
const TO = '2026-06-15';

const mockSummary: AvailabilitySummaryResponse = [
  { date: FROM, available: true, slotCount: 10 },
  { date: TO, available: false, slotCount: 0 },
];

describe('ScheduleAvailabilitySummaryController (component)', () => {
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

  const summaryUrl = `/v1/schedule/availability/summary?from=${FROM}&to=${TO}&serviceIds=${SERVICE_ID}`;

  it('returns 400 when X-Tenant-Slug header is missing', async () => {
    const res = await request(app.getHttpServer()).get(summaryUrl);

    expect(res.status).toBe(400);
  });

  it('returns 400 when from param is malformed (Zod validation)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/schedule/availability/summary?from=bad&to=${TO}&serviceIds=${SERVICE_ID}`)
      .set('x-tenant-slug', TENANT_SLUG);

    expect(res.status).toBe(400);
  });

  it('returns 400 when serviceIds param is missing (Zod validation)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/schedule/availability/summary?from=${FROM}&to=${TO}`)
      .set('x-tenant-slug', TENANT_SLUG);

    expect(res.status).toBe(400);
  });

  it('returns 200 with summary array for a valid public request', async () => {
    backendHttpService.get.mockResolvedValueOnce({ id: TENANT_ID });
    backendHttpService.getForPublic.mockResolvedValueOnce(mockSummary);

    const res = await request(app.getHttpServer())
      .get(summaryUrl)
      .set('x-tenant-slug', TENANT_SLUG);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toHaveProperty('date');
    expect(res.body[0]).toHaveProperty('available');
    expect(res.body[0]).toHaveProperty('slotCount');
  });

  it('works without any JWT token (public endpoint)', async () => {
    backendHttpService.get.mockResolvedValueOnce({ id: TENANT_ID });
    backendHttpService.getForPublic.mockResolvedValueOnce(mockSummary);

    const res = await request(app.getHttpServer())
      .get(summaryUrl)
      .set('x-tenant-slug', TENANT_SLUG);
    // No Authorization header — must succeed (200, not 401)
    expect(res.status).toBe(200);
  });

  it('propagates backend 422 for invalid date range', async () => {
    backendHttpService.get.mockResolvedValueOnce({ id: TENANT_ID });
    backendHttpService.getForPublic.mockRejectedValueOnce(
      new HttpException({ title: 'Unprocessable Entity', status: 422 }, 422),
    );

    const res = await request(app.getHttpServer())
      .get(summaryUrl)
      .set('x-tenant-slug', TENANT_SLUG);

    expect(res.status).toBe(422);
  });

  it('propagates backend 400 for invalid serviceId', async () => {
    backendHttpService.get.mockResolvedValueOnce({ id: TENANT_ID });
    backendHttpService.getForPublic.mockRejectedValueOnce(
      new HttpException({ title: 'Bad Request', status: 400 }, 400),
    );

    const res = await request(app.getHttpServer())
      .get(summaryUrl)
      .set('x-tenant-slug', TENANT_SLUG);

    expect(res.status).toBe(400);
  });

  // ─── M23-S29 — pinned selections and a chosen duration ──────────────────────

  describe('resourceSelections / durationMinutes', () => {
    const RESOURCE_ID = '00000000-0000-4000-8000-000000000002';
    const SELECTIONS = `${SERVICE_ID}:-:STAFF:${RESOURCE_ID}`;

    it('forwards the comma-joined resourceSelections string verbatim and the duration as a number', async () => {
      backendHttpService.get.mockResolvedValueOnce({ id: TENANT_ID });
      backendHttpService.getForPublic.mockResolvedValueOnce(mockSummary);

      const res = await request(app.getHttpServer())
        .get(`${summaryUrl}&resourceSelections=${SELECTIONS}&durationMinutes=90`)
        .set('x-tenant-slug', TENANT_SLUG);

      expect(res.status).toBe(200);
      expect(backendHttpService.getForPublic).toHaveBeenCalledWith(
        '/schedule/availability/summary',
        TENANT_ID,
        expect.objectContaining({ resourceSelections: SELECTIONS, durationMinutes: 90 }),
      );
    });

    it('returns 400 when resourceId and resourceSelections are combined', async () => {
      const res = await request(app.getHttpServer())
        .get(`${summaryUrl}&resourceId=${RESOURCE_ID}&resourceSelections=${SELECTIONS}`)
        .set('x-tenant-slug', TENANT_SLUG);

      expect(res.status).toBe(400);
    });

    it('returns 400 for a malformed resourceSelections item before reaching the backend', async () => {
      const res = await request(app.getHttpServer())
        .get(`${summaryUrl}&resourceSelections=not-a-selection`)
        .set('x-tenant-slug', TENANT_SLUG);

      expect(res.status).toBe(400);
      expect(backendHttpService.getForPublic).not.toHaveBeenCalled();
    });

    it('returns 400 for a non-positive duration', async () => {
      const res = await request(app.getHttpServer())
        .get(`${summaryUrl}&durationMinutes=0`)
        .set('x-tenant-slug', TENANT_SLUG);

      expect(res.status).toBe(400);
    });

    it('propagates backend 422 for a rejected selection', async () => {
      backendHttpService.get.mockResolvedValueOnce({ id: TENANT_ID });
      backendHttpService.getForPublic.mockRejectedValueOnce(
        new HttpException({ title: 'Unprocessable', status: 422 }, 422),
      );

      const res = await request(app.getHttpServer())
        .get(`${summaryUrl}&resourceSelections=${SELECTIONS}`)
        .set('x-tenant-slug', TENANT_SLUG);

      expect(res.status).toBe(422);
    });
  });
});
