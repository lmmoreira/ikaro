import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PUSHABLE_EVENT_BUS, IPushableEventBus } from '../ports/pushable-event-bus.port';
import { Public } from '../decorators/public.decorator';
import { PubSubPushGuard } from '../guards/pubsub-push.guard';
import { ProblemDetail } from '../http/problem-detail';
import { AppLogger } from '../observability/app-logger';

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

  constructor(@Inject(PUSHABLE_EVENT_BUS) private readonly eventBus: IPushableEventBus) {}

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
      await this.eventBus.dispatchPushMessage(body.subscription, body.message.data);
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
