import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { ServiceIntakeQuestion } from '../../../contexts/booking/domain/service-booking-intake-schema';
import { ServiceBookingIntakeSchemaEntity } from '../../../contexts/booking/infrastructure/entities/service-booking-intake-schema.entity';

export class ServiceBookingIntakeSchemaEntityBuilder {
  private id = uuidv7();
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private serviceId = uuidv7();
  private version = 1;
  private questions: ServiceIntakeQuestion[] = [
    {
      fieldKey: 'accessNeeds',
      label: 'Necessidades de acesso',
      type: 'FREE_TEXT',
      required: false,
    },
  ];
  private readonly consentText = 'Concordo com os termos de agendamento';
  private readonly requiresNamedAttendees = false;
  private readonly participantCountRequired = false;
  private isActive = true;
  private readonly createdAt = new Date('2026-01-01T00:00:00Z');

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withServiceId(serviceId: string): this {
    this.serviceId = serviceId;
    return this;
  }

  withVersion(version: number): this {
    this.version = version;
    return this;
  }

  withQuestions(questions: ServiceIntakeQuestion[]): this {
    this.questions = questions;
    return this;
  }

  withIsActive(isActive: boolean): this {
    this.isActive = isActive;
    return this;
  }

  build(): ServiceBookingIntakeSchemaEntity {
    const e = new ServiceBookingIntakeSchemaEntity();
    e.id = this.id;
    e.tenantId = this.tenantId;
    e.serviceId = this.serviceId;
    e.version = this.version;
    e.questions = this.questions;
    e.consentText = this.consentText;
    // consentVersion always mirrors version — no publish flow in this codebase can make them
    // diverge (see ServiceBookingIntakeSchema.publish()'s own identical comment).
    e.consentVersion = this.version;
    e.requiresNamedAttendees = this.requiresNamedAttendees;
    e.participantCountRequired = this.participantCountRequired;
    e.isActive = this.isActive;
    e.createdAt = this.createdAt;
    return e;
  }
}
