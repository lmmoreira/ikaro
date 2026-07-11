import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { EVENT_BUS } from '../../ports/event-bus.port';
import { PUSHABLE_EVENT_BUS } from '../../ports/pushable-event-bus.port';
import { OIDC_TOKEN_VERIFIER, IOidcTokenVerifier } from '../../ports/oidc-token-verifier.port';
import { DomainEvent } from '../../domain/domain-event';
import { PubSubPushGuard } from '../../guards/pubsub-push.guard';

jest.mock('@google-cloud/pubsub', () => ({
  PubSub: jest.fn().mockImplementation(() => ({
    topic: jest.fn(),
    subscription: jest.fn(),
    createTopic: jest.fn(),
  })),
}));

import { GcpPubSubEventBusAdapter } from './gcp-pubsub-event-bus.adapter';
import { PubSubPushController } from './pubsub-push.controller';

const AUDIENCE = 'https://backend.internal/pubsub/push';
const INVOKER_EMAIL = 'ikaro-pubsub-invoker@project.iam.gserviceaccount.com';

const CONFIG_VALUES: Record<string, unknown> = {
  PUBSUB_PROJECT_ID: 'ikaro-local',
  APP_ENV: 'production',
  PUBSUB_CONSUMER_MODE: 'push',
  PUBSUB_AUTO_CREATE: false,
  PUBSUB_PUSH_AUDIENCE: AUDIENCE,
  PUBSUB_PUSH_SERVICE_ACCOUNT: INVOKER_EMAIL,
  PUBSUB_SUBSCRIPTION_SUFFIX: '',
};

const fakeConfigService = {
  get: (key: string, defaultValue?: unknown): unknown => CONFIG_VALUES[key] ?? defaultValue,
  getOrThrow: (key: string): unknown => {
    if (CONFIG_VALUES[key] === undefined) throw new Error(`Missing config: ${key}`);
    return CONFIG_VALUES[key];
  },
} as unknown as ConfigService;

const validVerifier: IOidcTokenVerifier = {
  verify: jest.fn().mockResolvedValue({
    iss: 'https://accounts.google.com',
    email: INVOKER_EMAIL,
    email_verified: true,
  }),
};

class StubEvent extends DomainEvent<{ value: string }> {
  readonly eventVersion = 1;
  readonly data: { value: string };
  constructor(data: { value: string }) {
    super('tenant-1', 'corr-1');
    this.data = data;
  }
}

function encode(event: DomainEvent): string {
  return Buffer.from(JSON.stringify(event)).toString('base64');
}

describe('PubSubPushController (integration)', () => {
  let app: INestApplication;
  let handlerSpy: jest.Mock;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PubSubPushController],
      providers: [
        { provide: ConfigService, useValue: fakeConfigService },
        { provide: EVENT_BUS, useClass: GcpPubSubEventBusAdapter },
        { provide: PUSHABLE_EVENT_BUS, useExisting: EVENT_BUS },
        { provide: OIDC_TOKEN_VERIFIER, useValue: validVerifier },
        PubSubPushGuard,
      ],
    }).compile();

    const adapter = moduleRef.get<GcpPubSubEventBusAdapter>(EVENT_BUS);
    handlerSpy = jest.fn().mockResolvedValue(undefined);
    adapter.subscribe(StubEvent.name, handlerSpy, 'test-consumer');

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    handlerSpy.mockClear();
    handlerSpy.mockResolvedValue(undefined);
  });

  it('dispatches a synthetic push envelope to the correct handler and returns 204', async () => {
    const body = {
      message: {
        data: encode(new StubEvent({ value: 'hello' })),
        messageId: 'm-1',
        attributes: {},
      },
      subscription: 'projects/ikaro-local/subscriptions/ikaro-StubEvent-test-consumer',
    };

    await request(app.getHttpServer())
      .post('/pubsub/push')
      .set('Authorization', 'Bearer fake-valid-token')
      .send(body)
      .expect(204);

    expect(handlerSpy).toHaveBeenCalledTimes(1);
    const received = handlerSpy.mock.calls[0][0] as StubEvent;
    expect(received.eventName).toBe(StubEvent.name);
    expect(received.data.value).toBe('hello');
  });

  it('returns 500 when the handler throws, so Pub/Sub redelivers', async () => {
    handlerSpy.mockRejectedValueOnce(new Error('handler boom'));
    const body = {
      message: {
        data: encode(new StubEvent({ value: 'fails' })),
        messageId: 'm-2',
        attributes: {},
      },
      subscription: 'projects/ikaro-local/subscriptions/ikaro-StubEvent-test-consumer',
    };

    const response = await request(app.getHttpServer())
      .post('/pubsub/push')
      .set('Authorization', 'Bearer fake-valid-token')
      .send(body)
      .expect(500);

    expect(response.body.detail).toBe('handler boom');
    expect(handlerSpy).toHaveBeenCalledTimes(1);
  });

  it('rejects with 403 when the Authorization header is missing', async () => {
    const body = {
      message: { data: encode(new StubEvent({ value: 'x' })), messageId: 'm-3', attributes: {} },
      subscription: 'projects/ikaro-local/subscriptions/ikaro-StubEvent-test-consumer',
    };

    await request(app.getHttpServer()).post('/pubsub/push').send(body).expect(403);

    expect(handlerSpy).not.toHaveBeenCalled();
  });
});
