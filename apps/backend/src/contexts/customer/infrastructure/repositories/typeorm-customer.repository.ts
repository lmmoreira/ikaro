import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { Address, AddressProps } from '../../../../shared/value-objects/address';
import { Email } from '../../../../shared/value-objects/email.vo';
import { PhoneNumber } from '../../../../shared/value-objects/phone-number.vo';
import {
  CustomerSearchRow,
  CustomerTenantSummary,
  ICustomerRepository,
} from '../../application/ports/customer-repository.port';
import { Customer } from '../../domain/customer.aggregate';
import { CustomerEntity } from '../entities/customer.entity';

@Injectable()
export class TypeOrmCustomerRepository implements ICustomerRepository {
  constructor(
    @InjectRepository(CustomerEntity)
    private readonly repo: Repository<CustomerEntity>,
  ) {}

  async findByTenantAndOAuthId(tenantId: string, googleOAuthId: string): Promise<Customer | null> {
    const entity = await this.repo.findOne({ where: { tenantId, googleOAuthId } });
    return entity ? this.toDomain(entity) : null;
  }

  async findById(id: string, tenantId: string): Promise<Customer | null> {
    const entity = await this.repo.findOne({ where: { id, tenantId } });
    return entity ? this.toDomain(entity) : null;
  }

  async findAllTenantsByOAuthId(googleOAuthId: string): Promise<CustomerTenantSummary[]> {
    const rows = await this.repo.find({ where: { googleOAuthId } });
    return rows.map((r) => ({ tenantId: r.tenantId, customerId: r.id }));
  }

  async searchByTenant(
    tenantId: string,
    search: string | undefined,
    limit: number,
  ): Promise<{ rows: CustomerSearchRow[]; total: number }> {
    const where = search
      ? [
          { tenantId, name: ILike(`%${search}%`) },
          { tenantId, email: ILike(`%${search}%`) },
        ]
      : { tenantId };
    const [entities, total] = await this.repo.findAndCount({
      where,
      take: limit,
      order: { name: 'ASC' },
    });
    return {
      rows: entities.map((e) => ({ customerId: e.id, name: e.name, email: e.email })),
      total,
    };
  }

  async save(customer: Customer): Promise<void> {
    const entity = this.toEntity(customer);
    const manager = getActiveEntityManager();
    if (manager) {
      await manager.save(CustomerEntity, entity);
    } else {
      await this.repo.save(entity);
    }
  }

  private toDomain(entity: CustomerEntity): Customer {
    return Customer.reconstitute({
      id: entity.id,
      tenantId: entity.tenantId,
      googleOAuthId: entity.googleOAuthId,
      email: Email.create(entity.email),
      name: entity.name,
      phone: entity.phone ? PhoneNumber.create(entity.phone) : null,
      defaultAddress: entity.defaultAddress
        ? Address.reconstitute(entity.defaultAddress as unknown as AddressProps)
        : null,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
  }

  private toEntity(customer: Customer): CustomerEntity {
    const entity = new CustomerEntity();
    entity.id = customer.id;
    entity.tenantId = customer.tenantId;
    entity.googleOAuthId = customer.googleOAuthId;
    entity.email = customer.email.address;
    entity.name = customer.name;
    entity.phone = customer.phone?.value ?? null;
    entity.defaultAddress =
      (customer.defaultAddress?.toJSON() as unknown as Record<string, unknown>) ?? null;
    entity.createdAt = customer.createdAt;
    entity.updatedAt = customer.updatedAt;
    return entity;
  }
}
