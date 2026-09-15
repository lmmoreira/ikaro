import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import { uuidv7 } from '../../../shared/domain/uuid-v7';

// UC-054's typed markers — 'PICKUP_ADDRESS' projects into the pre-existing
// services.requires_pickup_address / bookings.pickup_address columns (docs/13-DATABASE_SCHEMA.md
// § booking.service_booking_intake_schema), the others are generic input shapes.
export type ServiceIntakeQuestionType = 'FREE_TEXT' | 'NAMED_ATTENDEES' | 'PICKUP_ADDRESS';

export interface ServiceIntakeQuestion {
  fieldKey: string;
  label: string;
  type: ServiceIntakeQuestionType;
  required: boolean;
}

export interface ServiceBookingIntakeSchemaProps {
  id: string;
  tenantId: string;
  serviceId: string;
  version: number;
  questions: ServiceIntakeQuestion[];
  consentText: string;
  consentVersion: number;
  requiresNamedAttendees: boolean;
  participantCountRequired: boolean;
  isActive: boolean;
  createdAt: Date;
}

export interface PublishServiceBookingIntakeSchemaProps {
  tenantId: string;
  serviceId: string;
  // The currently-active version's version number, or 0 when the service has none yet —
  // resolved by the caller (IServiceIntakeSchemaRepository.findActiveByServiceId), same
  // caller-resolves-context shape as setResourceRequirements()'s activeResourceIdsByType.
  previousVersion: number;
  questions: ServiceIntakeQuestion[];
  consentText: string;
  requiresNamedAttendees: boolean;
  participantCountRequired: boolean;
}

// A genuinely new pattern for this codebase (story-discovery, M22-S02, 2026-09-15) — an
// independent aggregate root, own repository, "new version supersedes, never edits the previous
// one" (docs/13-DATABASE_SCHEMA.md § service_booking_intake_schema). Field-format validation
// (question count/uniqueness, consent text length) lives at the Zod boundary
// (PublishServiceIntakeSchemaSchema, packages/validation/src/booking.ts) — mirrors
// UpdateServiceLegsSchema's own "no domain-level duplicate check for a format-only rule"
// precedent; there is no cross-field business invariant left for this aggregate to enforce.
export class ServiceBookingIntakeSchema extends AggregateRoot {
  private readonly props: ServiceBookingIntakeSchemaProps;

  private constructor(props: ServiceBookingIntakeSchemaProps) {
    super();
    this.props = props;
  }

  get id(): string {
    return this.props.id;
  }
  get tenantId(): string {
    return this.props.tenantId;
  }
  get serviceId(): string {
    return this.props.serviceId;
  }
  get version(): number {
    return this.props.version;
  }
  get questions(): ServiceIntakeQuestion[] {
    return [...this.props.questions];
  }
  get consentText(): string {
    return this.props.consentText;
  }
  get consentVersion(): number {
    return this.props.consentVersion;
  }
  get requiresNamedAttendees(): boolean {
    return this.props.requiresNamedAttendees;
  }
  get participantCountRequired(): boolean {
    return this.props.participantCountRequired;
  }
  get isActive(): boolean {
    return this.props.isActive;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }

  // UC-054 A2 — the caller (PublishServiceIntakeSchemaUseCase) uses this to decide whether to
  // also flip Service.requiresPickupAddress in the same transaction.
  get hasPickupAddressQuestion(): boolean {
    return this.props.questions.some((q) => q.type === 'PICKUP_ADDRESS');
  }

  // consentVersion mirrors version — this story has no separate consent-only update flow, so a
  // publish always bumps both together (there is nothing yet that could make them diverge).
  static publish(input: PublishServiceBookingIntakeSchemaProps): ServiceBookingIntakeSchema {
    const version = input.previousVersion + 1;
    return new ServiceBookingIntakeSchema({
      id: uuidv7(),
      tenantId: input.tenantId,
      serviceId: input.serviceId,
      version,
      questions: [...input.questions],
      consentText: input.consentText,
      consentVersion: version,
      requiresNamedAttendees: input.requiresNamedAttendees,
      participantCountRequired: input.participantCountRequired,
      isActive: true,
      createdAt: new Date(),
    });
  }

  static reconstitute(props: ServiceBookingIntakeSchemaProps): ServiceBookingIntakeSchema {
    return new ServiceBookingIntakeSchema(props);
  }
}
