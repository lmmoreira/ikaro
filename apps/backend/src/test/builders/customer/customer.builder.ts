import { Customer } from '../../../contexts/customer/domain/customer.aggregate';

export class CustomerBuilder {
  private tenantId = 'tenant-id-1';
  private googleOAuthId = 'google-sub-1';
  private email = 'customer@example.com';
  private name = 'João Silva';
  private phone: string | null = null;

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

  withPhone(phone: string | null): this {
    this.phone = phone;
    return this;
  }

  build(): Customer {
    const customer = Customer.create(this.tenantId, this.googleOAuthId, this.email, this.name);
    if (this.phone) customer.updateProfile(this.name, this.phone, null);
    return customer;
  }
}
