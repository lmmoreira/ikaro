import { INestApplication } from '@nestjs/common';
import {
  MockHttpService,
  createTestApp,
  makeObservableError,
  makeObservableResponse,
  request,
} from '../test/component-test.helpers';

describe('HealthController (component)', () => {
  let app: INestApplication;
  let httpService: MockHttpService;
  let restoreEnv: () => void;

  beforeAll(async () => {
    ({ app, httpService, restoreEnv } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
    restoreEnv();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('GET /v1/health/live returns 200 with no Authorization header (proves @Public() bypasses JwtAuthGuard)', async () => {
    const res = await request(app.getHttpServer()).get('/v1/health/live');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /v1/health/ready returns 200 with no Authorization header when the backend is reachable', async () => {
    httpService.get.mockReturnValue(makeObservableResponse({}));

    const res = await request(app.getHttpServer()).get('/v1/health/ready');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /v1/health/ready returns 503 when the backend is unreachable', async () => {
    httpService.get.mockReturnValue(makeObservableError(new Error('ECONNREFUSED')));

    const res = await request(app.getHttpServer()).get('/v1/health/ready');

    expect(res.status).toBe(503);
  });
});
