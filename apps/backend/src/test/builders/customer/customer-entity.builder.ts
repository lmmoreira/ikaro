import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { CustomerEntity } from '../../../contexts/customer/infrastructure/entities/customer.entity';

export class CustomerEntityBuilder {
  private id = uuidv7();
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private googleOAuthId = 'google-sub-customer-a';
  private email = 'customer@example.com';
  private name = 'Cliente Teste';
  private readonly phone: string | null = null;
  private readonly defaultAddress: Record<string, unknown> | null = null;
  private readonly createdAt = new Date('2026-01-01T00:00:00Z');
  private readonly updatedAt = new Date('2026-01-01T00:00:00Z');

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withGoogleOAuthId(googleOAuthId: string): this {
    this.googleOAuthId = googleOAuthId;
    return this;
  }

  withEmail(email: string): this {
    this.email = email;
    return this;
  }

  withName(name: string): this {
    this.name = name;
    return this;
  }

  build(): CustomerEntity {
    const e = new CustomerEntity();
    e.id = this.id;
    e.tenantId = this.tenantId;
    e.googleOAuthId = this.googleOAuthId;
    e.email = this.email;
    e.name = this.name;
    e.phone = this.phone;
    e.defaultAddress = this.defaultAddress;
    e.createdAt = this.createdAt;
    e.updatedAt = this.updatedAt;
    return e;
  }
}
