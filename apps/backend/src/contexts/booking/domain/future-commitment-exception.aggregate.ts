import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { FutureCommitmentExceptionAlreadyResolvedError } from './errors/future-commitment-exception.error';
import { FutureCommitmentExceptionDismissed } from './events/future-commitment-exception-dismissed.event';
import { FutureCommitmentExceptionRaised } from './events/future-commitment-exception-raised.event';
import { FutureCommitmentExceptionResolved } from './events/future-commitment-exception-resolved.event';
import {
  FutureCommitmentAlternative,
  FutureCommitmentExceptionAffectedType,
  FutureCommitmentExceptionProps,
  FutureCommitmentExceptionResolutionType,
  FutureCommitmentExceptionSourceType,
  FutureCommitmentExceptionStatus,
  RaiseFutureCommitmentExceptionOptions,
} from './future-commitment-exception.types';

export * from './future-commitment-exception.types';

// docs/02-DOMAIN_MODEL.md § FutureCommitmentException. A manager-owned worklist entry: it only
// records an impact and its advisory alternatives. The booking change a resolution implies is
// applied by the resolving use case in the same transaction, never by this aggregate.
export class FutureCommitmentException extends AggregateRoot {
  private readonly props: FutureCommitmentExceptionProps;

  private constructor(props: FutureCommitmentExceptionProps) {
    super();
    this.props = { ...props, alternatives: props.alternatives.map((a) => ({ ...a })) };
  }

  get id(): string {
    return this.props.id;
  }
  get tenantId(): string {
    return this.props.tenantId;
  }
  get sourceType(): FutureCommitmentExceptionSourceType {
    return this.props.sourceType;
  }
  get sourceId(): string {
    return this.props.sourceId;
  }
  get affectedType(): FutureCommitmentExceptionAffectedType {
    return this.props.affectedType;
  }
  get affectedId(): string {
    return this.props.affectedId;
  }
  get status(): FutureCommitmentExceptionStatus {
    return this.props.status;
  }
  get ownerStaffId(): string | null {
    return this.props.ownerStaffId;
  }
  get resolutionType(): FutureCommitmentExceptionResolutionType | null {
    return this.props.resolutionType;
  }
  get resolutionReason(): string | null {
    return this.props.resolutionReason;
  }
  get resolvedByStaffId(): string | null {
    return this.props.resolvedByStaffId;
  }
  get resolvedAt(): Date | null {
    return this.props.resolvedAt;
  }
  get notificationOutcome(): string | null {
    return this.props.notificationOutcome;
  }
  get alternatives(): FutureCommitmentAlternative[] {
    return this.props.alternatives.map((a) => ({ ...a }));
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }

  static raise(options: RaiseFutureCommitmentExceptionOptions): FutureCommitmentException {
    const exception = new FutureCommitmentException({
      id: uuidv7(),
      tenantId: options.tenantId,
      sourceType: options.sourceType,
      sourceId: options.sourceId,
      affectedType: options.affectedType,
      affectedId: options.affectedId,
      status: 'OPEN',
      ownerStaffId: null,
      resolutionType: null,
      resolutionReason: null,
      resolvedByStaffId: null,
      resolvedAt: null,
      notificationOutcome: null,
      alternatives: options.alternatives,
      createdAt: new Date(),
    });
    exception.addDomainEvent(
      new FutureCommitmentExceptionRaised(options.tenantId, options.correlationId, {
        exceptionId: exception.id,
        sourceType: options.sourceType,
        sourceId: options.sourceId,
        affectedType: options.affectedType,
        affectedId: options.affectedId,
        ownerStaffId: null,
      }),
    );
    return exception;
  }

  static reconstitute(props: FutureCommitmentExceptionProps): FutureCommitmentException {
    return new FutureCommitmentException(props);
  }

  // UC-073 A1 — a repeated trigger for the same unresolved impact refreshes the open entry's
  // advisory alternatives instead of creating (or announcing) a second one.
  refreshAlternatives(alternatives: FutureCommitmentAlternative[]): void {
    this.assertOpen();
    this.props.alternatives = alternatives.map((a) => ({ ...a }));
  }

  resolve(
    staffId: string,
    resolutionType: FutureCommitmentExceptionResolutionType,
    reason: string | null,
    correlationId: string,
  ): void {
    this.assertOpen();
    this.props.status = 'RESOLVED';
    this.props.resolutionType = resolutionType;
    this.props.resolutionReason = reason;
    this.props.resolvedByStaffId = staffId;
    this.props.resolvedAt = new Date();
    this.addDomainEvent(
      new FutureCommitmentExceptionResolved(this.props.tenantId, correlationId, {
        exceptionId: this.props.id,
        resolutionType,
        resolvedByStaffId: staffId,
        affectedType: this.props.affectedType,
        affectedId: this.props.affectedId,
      }),
    );
  }

  dismiss(staffId: string, reason: string, correlationId: string): void {
    this.assertOpen();
    this.props.status = 'DISMISSED';
    this.props.resolutionReason = reason;
    this.props.resolvedByStaffId = staffId;
    this.props.resolvedAt = new Date();
    this.addDomainEvent(
      new FutureCommitmentExceptionDismissed(this.props.tenantId, correlationId, {
        exceptionId: this.props.id,
        resolvedByStaffId: staffId,
        resolutionReason: reason,
      }),
    );
  }

  private assertOpen(): void {
    if (this.props.status !== 'OPEN') {
      throw new FutureCommitmentExceptionAlreadyResolvedError(this.props.id);
    }
  }
}
