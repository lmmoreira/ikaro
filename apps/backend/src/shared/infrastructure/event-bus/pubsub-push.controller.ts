import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Optional,
  Post,
  UseGuards,
} from '@nestjs/common';
import { defaultTracingPort, ITracingPort } from '@ikaro/observability';
import { PUSHABLE_EVENT_BUS, IPushableEventBus } from '../../ports/pushable-event-bus.port';
import { Public } from '../../decorators/public.decorator';
import { PubSubPushGuard } from '../../guards/pubsub-push.guard';
import { ProblemDetail } from '@ikaro/types';
import { AppLogger } from '../../observability/app-logger';

interface PubSubPushMessage {
  data: string;
  messageId: string;
  attributes?: Record<string, string>;
  deliveryAttempt?: number;
}

interface PubSubPushBody {
  message: PubSubPushMessage;
  subscription: string;
}

// Composition-only: decodes nothing itself, just forwards to the adapter's push-dispatch method.
// @Public() bypasses InternalApiGuard (this route carries a Google OIDC token, not X-Internal-Key);
// PubSubPushGuard is the real authentication here.
@Public()
@UseGuards(PubSubPushGuard)
@Controller('pubsub')
export class PubSubPushController {
  private readonly logger = new AppLogger(PubSubPushController.name);

  constructor(
    @Inject(PUSHABLE_EVENT_BUS) private readonly eventBus: IPushableEventBus,
    // @Optional() so Nest's DI container doesn't throw trying to resolve an interface token when
    // no provider is bound for it — falls through to the default, same pattern as
    // CorrelationMiddleware (apps/backend/src/shared/request/correlation.middleware.ts).
    @Optional() private readonly tracingPort: ITracingPort = defaultTracingPort,
  ) {}

  @Post('push')
  @HttpCode(HttpStatus.NO_CONTENT)
  async push(@Body() body: PubSubPushBody): Promise<void> {
    if (!body?.message?.data || !body?.subscription) {
      // Malformed envelope — retrying will never fix a request this shape, so ack instead of
      // triggering a Pub/Sub redelivery loop (mirrors dispatchPushMessage's own unparseable-payload
      // and unregistered-subscription handling).
      this.logger.error(
        '[pubsub-push] malformed push envelope — acking to prevent redelivery loop',
      );
      return;
    }

    try {
      // TD28: reconstructs the trace context injected by OutboxPublisher.publish() (carried here
      // via message.attributes, since W3C trace context only travels as an HTTP header on its
      // own, not inside a Pub/Sub push body) — so whatever span the dispatched handler starts
      // becomes a genuine child of the original request's trace.
      await this.tracingPort.runWithExtractedContext(body.message.attributes ?? {}, () =>
        this.eventBus.dispatchPushMessage(body.subscription, body.message.data),
      );
    } catch (err) {
      const problem: ProblemDetail = {
        type: 'about:blank',
        title: 'Push Handler Failed',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        detail: err instanceof Error ? err.message : 'Unknown error',
      };
      // Rethrown as 5xx so Pub/Sub nacks and redelivers per the subscription's retry policy.
      throw new HttpException(problem, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
