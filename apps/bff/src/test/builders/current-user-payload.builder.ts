import { CurrentUserPayload } from '../../shared/decorators/current-user.decorator';

export class CurrentUserPayloadBuilder {
  private sub = '20000000-0000-4000-8000-000000000001';
  private tenantId = '10000000-0000-4000-8000-000000000001';
  private tenantSlug = 'lavacar-bh';
  private tenantName = 'Lavacar BH';
  private userName: string | null = 'Test User';
  private role = 'CUSTOMER';
  private locale = 'pt-BR';

  withSub(sub: string): this {
    this.sub = sub;
    return this;
  }

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withTenantSlug(tenantSlug: string): this {
    this.tenantSlug = tenantSlug;
    return this;
  }

  withTenantName(tenantName: string): this {
    this.tenantName = tenantName;
    return this;
  }

  withUserName(userName: string | null): this {
    this.userName = userName;
    return this;
  }

  withRole(role: string): this {
    this.role = role;
    return this;
  }

  withLocale(locale: string): this {
    this.locale = locale;
    return this;
  }

  build(): CurrentUserPayload {
    return {
      sub: this.sub,
      tenantId: this.tenantId,
      tenantSlug: this.tenantSlug,
      tenantName: this.tenantName,
      userName: this.userName,
      role: this.role,
      locale: this.locale,
    };
  }

  static asCustomer(): CurrentUserPayloadBuilder {
    return new CurrentUserPayloadBuilder()
      .withSub('20000000-0000-4000-8000-000000000001')
      .withUserName('Test Customer')
      .withRole('CUSTOMER');
  }

  static asManager(): CurrentUserPayloadBuilder {
    return new CurrentUserPayloadBuilder()
      .withSub('20000000-0000-4000-8000-000000000002')
      .withUserName('Test Manager')
      .withRole('MANAGER');
  }

  static asStaff(): CurrentUserPayloadBuilder {
    return new CurrentUserPayloadBuilder()
      .withSub('20000000-0000-4000-8000-000000000003')
      .withUserName('Test Staff')
      .withRole('STAFF');
  }
}
