import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { runInNewTransaction } from '../../../../shared/infrastructure/run-in-new-transaction';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { IServiceIntakeSchemaRepository } from '../../application/ports/service-intake-schema-repository.port';
import { ServiceBookingIntakeSchema } from '../../domain/service-booking-intake-schema';
import { ServiceBookingIntakeSchemaEntity } from '../entities/service-booking-intake-schema.entity';

@Injectable()
export class TypeOrmServiceIntakeSchemaRepository implements IServiceIntakeSchemaRepository {
  constructor(
    @InjectRepository(ServiceBookingIntakeSchemaEntity)
    private readonly repo: Repository<ServiceBookingIntakeSchemaEntity>,
  ) {}

  async findActiveByServiceId(
    serviceId: string,
    tenantId: string,
  ): Promise<ServiceBookingIntakeSchema | null> {
    const entity = await this.repo.findOne({ where: { serviceId, tenantId, isActive: true } });
    return entity ? this.toDomain(entity) : null;
  }

  async findAllByServiceId(
    serviceId: string,
    tenantId: string,
  ): Promise<ServiceBookingIntakeSchema[]> {
    const entities = await this.repo.find({
      where: { serviceId, tenantId },
      order: { version: 'ASC' },
    });
    return entities.map((e) => this.toDomain(e));
  }

  // Deactivate-then-insert, inside the same transaction as the caller's Service.save() write
  // (PublishServiceIntakeSchemaUseCase) — the caller already holds a row lock on the parent
  // Service (findByIdForUpdate), which serializes concurrent publishes for the same service and
  // rules out two callers racing to activate two different "next" versions.
  async publish(schema: ServiceBookingIntakeSchema): Promise<void> {
    const entity = this.toEntity(schema);
    const manager = getActiveEntityManager();
    if (manager) {
      await manager.update(
        ServiceBookingIntakeSchemaEntity,
        { tenantId: schema.tenantId, serviceId: schema.serviceId, isActive: true },
        { isActive: false },
      );
      await manager.save(ServiceBookingIntakeSchemaEntity, entity);
    } else {
      await runInNewTransaction(this.repo.manager, async (tx) => {
        await tx.update(
          ServiceBookingIntakeSchemaEntity,
          { tenantId: schema.tenantId, serviceId: schema.serviceId, isActive: true },
          { isActive: false },
        );
        await tx.save(ServiceBookingIntakeSchemaEntity, entity);
      });
    }
  }

  private toDomain(entity: ServiceBookingIntakeSchemaEntity): ServiceBookingIntakeSchema {
    return ServiceBookingIntakeSchema.reconstitute({
      id: entity.id,
      tenantId: entity.tenantId,
      serviceId: entity.serviceId,
      version: entity.version,
      questions: entity.questions,
      consentText: entity.consentText,
      consentVersion: entity.consentVersion,
      requiresNamedAttendees: entity.requiresNamedAttendees,
      participantCountRequired: entity.participantCountRequired,
      isActive: entity.isActive,
      createdAt: entity.createdAt,
    });
  }

  private toEntity(schema: ServiceBookingIntakeSchema): ServiceBookingIntakeSchemaEntity {
    const entity = new ServiceBookingIntakeSchemaEntity();
    entity.id = schema.id;
    entity.tenantId = schema.tenantId;
    entity.serviceId = schema.serviceId;
    entity.version = schema.version;
    entity.questions = schema.questions;
    entity.consentText = schema.consentText;
    entity.consentVersion = schema.consentVersion;
    entity.requiresNamedAttendees = schema.requiresNamedAttendees;
    entity.participantCountRequired = schema.participantCountRequired;
    entity.isActive = schema.isActive;
    entity.createdAt = schema.createdAt;
    return entity;
  }
}
