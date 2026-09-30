import { FutureCommitmentExceptionResolved } from '../../../contexts/booking/domain/events/future-commitment-exception-resolved.event';

export class FutureCommitmentExceptionResolvedEventBuilder {
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private correlationId = 'corr-fce-resolved-1';
  private exceptionId = '11111111-0002-7000-8000-000000000001';
  private readonly affectedId = '33333333-0002-7000-8000-000000000001';
  private readonly resolvedByStaffId = '44444444-0002-7000-8000-000000000001';

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

  build(): FutureCommitmentExceptionResolved {
    return new FutureCommitmentExceptionResolved(this.tenantId, this.correlationId, {
      exceptionId: this.exceptionId,
      resolutionType: 'REASSIGN',
      resolvedByStaffId: this.resolvedByStaffId,
      affectedType: 'BOOKING',
      affectedId: this.affectedId,
    });
  }
}
