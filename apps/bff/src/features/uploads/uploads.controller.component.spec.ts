import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { GenericErrorCode } from '@ikaro/types';
import { createTestApp, makeCustomerJwt, request } from '../../test/component-test.helpers';

describe('UploadsController (component)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let restoreEnv: () => void;

  beforeAll(async () => {
    ({ app, jwtService, restoreEnv } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
    restoreEnv();
  });

  it('returns 401 without a token', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/uploads/signed-url')
      .send({ contentType: 'image/jpeg', filename: 'car.jpg' });
    expect(res.status).toBe(401);
  });

  it('returns 201 with a signed url for an allowed content type', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/uploads/signed-url')
      .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`)
      .send({ contentType: 'image/jpeg', filename: 'car.jpg' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ key: expect.stringContaining('car.jpg') });
  });

  it('returns 400 with the canonical violations[] envelope (GenericErrorCode.VALUE_INVALID) for an unsupported content type — no more Nest-default BadRequestException(string) shape', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/uploads/signed-url')
      .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`)
      .send({ contentType: 'application/pdf', filename: 'car.pdf' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      type: 'about:blank',
      status: 400,
      violations: [{ field: 'contentType', code: GenericErrorCode.VALUE_INVALID }],
    });
    expect(res.body).not.toHaveProperty('error'); // Nest's default {statusCode,message,error} shape is gone
  });

  it('returns 400 when filename is empty', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/uploads/signed-url')
      .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`)
      .send({ contentType: 'image/jpeg', filename: '' });

    expect(res.status).toBe(400);
  });
});
