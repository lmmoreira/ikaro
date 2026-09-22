import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { LeadFormSubmissionReceived } from '../../domain/events/lead-form-submission-received.event';
import { LogLeadFormSubmissionReceivedUseCase } from '../../application/use-cases/log-lead-form-submission-received.use-case';

@Injectable()
export class LeadFormSubmissionReceivedHandler implements OnModuleInit {
  private readonly logger = new AppLogger(LeadFormSubmissionReceivedHandler.name);

  constructor(
    private readonly logUseCase: LogLeadFormSubmissionReceivedUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<LeadFormSubmissionReceived>(
      LeadFormSubmissionReceived.name,
      (event) => this.handle(event),
      LogLeadFormSubmissionReceivedUseCase.CONSUMER_NAME,
    );
  }

  async handle(event: LeadFormSubmissionReceived): Promise<void> {
    try {
      await this.logUseCase.execute({
        eventId: event.eventId,
        submissionId: event.data.submissionId,
        tenantId: event.tenantId,
        customerId: event.data.customerId,
        correlationId: event.correlationId,
      });
    } catch (err) {
      this.logger.error(
        'LeadFormSubmissionReceivedHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}
