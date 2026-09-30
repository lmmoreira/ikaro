import { FutureCommitmentExceptionDismissed } from '../../../contexts/booking/domain/events/future-commitment-exception-dismissed.event';

export class FutureCommitmentExceptionDismissedEventBuilder {
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private correlationId = 'corr-fce-dismissed-1';
  private exceptionId = '11111111-0003-7000-8000-000000000001';
  private readonly resolvedByStaffId = '44444444-0003-7000-8000-000000000001';
  private readonly resolutionReason = 'Already handled by phone';

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withCorrelationId(correlationId: string): this {
    this.correlationId = correlationId;
    return this;
  }

  withExceptionId(exceptionId: string): this {
    this.exceptionId = exceptionId;
    return this;
  }

  build(): FutureCommitmentExceptionDismissed {
    return new FutureCommitmentExceptionDismissed(this.tenantId, this.correlationId, {
      exceptionId: this.exceptionId,
      resolvedByStaffId: this.resolvedByStaffId,
      resolutionReason: this.resolutionReason,
    });
  }
}
