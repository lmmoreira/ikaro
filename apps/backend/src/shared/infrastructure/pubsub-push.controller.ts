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
import { EVENT_BUS } from '../ports/event-bus.port';
import { GcpPubSubEventBusAdapter } from './gcp-pubsub-event-bus.adapter';
import { Public } from '../decorators/public.decorator';
import { PubSubPushGuard } from '../guards/pubsub-push.guard';
import { ProblemDetail } from '../http/problem-detail';

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
  constructor(@Inject(EVENT_BUS) private readonly eventBus: GcpPubSubEventBusAdapter) {}

  @Post('push')
  @HttpCode(HttpStatus.NO_CONTENT)
  async push(@Body() body: PubSubPushBody): Promise<void> {
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
