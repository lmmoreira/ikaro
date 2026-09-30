import { FutureCommitmentExceptionRaised } from '../../../contexts/booking/domain/events/future-commitment-exception-raised.event';

export class FutureCommitmentExceptionRaisedEventBuilder {
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private correlationId = 'corr-fce-raised-1';
  private exceptionId = '11111111-0001-7000-8000-000000000001';
  private readonly sourceId = '22222222-0001-7000-8000-000000000001';
  private readonly affectedId = '33333333-0001-7000-8000-000000000001';

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

  build(): FutureCommitmentExceptionRaised {
    return new FutureCommitmentExceptionRaised(this.tenantId, this.correlationId, {
      exceptionId: this.exceptionId,
      sourceType: 'RESOURCE_DEACTIVATION',
      sourceId: this.sourceId,
      affectedType: 'BOOKING',
      affectedId: this.affectedId,
      ownerStaffId: null,
    });
  }
}
