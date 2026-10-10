import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { escapeLikePattern } from '../../../../shared/utils/escape-like-pattern';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { Address } from '../../../../shared/value-objects/address';
import { Email } from '../../../../shared/value-objects/email.vo';
import { PhoneNumber } from '../../../../shared/value-objects/phone-number.vo';
import {
  CustomerSearchRow,
  CustomerTenantSummary,
  ICustomerRepository,
} from '../../application/ports/customer-repository.port';
import { Customer } from '../../domain/customer.aggregate';
import { CustomerEntity } from '../entities/customer.entity';

const PHONE_SEARCH_MIN_DIGITS = 4;

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
    const qb = this.repo
      .createQueryBuilder('c')
      .where('c.tenantId = :tenantId', { tenantId })
      .orderBy('c.name', 'ASC')
      .take(limit);
    if (search) qb.andWhere(this.buildSearchMatch(search));
    const [entities, total] = await qb.getManyAndCount();
    return {
      rows: entities.map((e) => ({
        customerId: e.id,
        name: e.name,
        email: e.email,
        phone: e.phone,
      })),
      total,
    };
  }

  // Name and email match the term as typed; the phone matches on digits only, so "(31) 99999-9999"
  // and "31999999999" find the same customer whatever format is stored. Below
  // PHONE_SEARCH_MIN_DIGITS the phone clause is left out — a term with no digits ("Maria") would
  // otherwise become an empty pattern that matches every customer. Every wrapped term is escaped.
  private buildSearchMatch(search: string): Brackets {
    const term = `%${escapeLikePattern(search)}%`;
    const digits = search.replace(/\D/g, '');
    return new Brackets((qb) => {
      qb.where('c.name ILIKE :term', { term }).orWhere('c.email ILIKE :term', { term });
      if (digits.length >= PHONE_SEARCH_MIN_DIGITS) {
        qb.orWhere(String.raw`regexp_replace(c.phone, '\D', '', 'g') LIKE :digits`, {
          digits: `%${digits}%`,
        });
      }
    });
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
      defaultAddress: entity.defaultAddress ? Address.reconstitute(entity.defaultAddress) : null,
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
    entity.defaultAddress = customer.defaultAddress?.toJSON() ?? null;
    entity.createdAt = customer.createdAt;
    entity.updatedAt = customer.updatedAt;
    return entity;
  }
}
