import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { LeadFormAnswer } from '../../../contexts/platform/domain/lead-form-submission.aggregate';
import { LeadFormSubmissionEntity } from '../../../contexts/platform/infrastructure/entities/lead-form-submission.entity';

export class LeadFormSubmissionEntityBuilder {
  private id = uuidv7();
  private tenantId = 'tenant-id-1';
  private customerId: string | null = null;
  private name = 'Maria Silva';
  private email = 'lead@example.com';
  private phone = '+5511912345678';
  private answers: LeadFormAnswer[] = [];
  private submittedAt = new Date('2026-01-01T00:00:00Z');
  private expiresAt = new Date('2026-07-01T00:00:00Z');
  private ipAddress = '203.0.113.10';

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withCustomerId(customerId: string | null): this {
    this.customerId = customerId;
    return this;
  }

  withName(name: string): this {
    this.name = name;
    return this;
  }

  withEmail(email: string): this {
    this.email = email;
    return this;
  }

  withPhone(phone: string): this {
    this.phone = phone;
    return this;
  }

  withAnswers(answers: LeadFormAnswer[]): this {
    this.answers = answers;
    return this;
  }

  withSubmittedAt(submittedAt: Date): this {
    this.submittedAt = submittedAt;
    return this;
  }

  withExpiresAt(expiresAt: Date): this {
    this.expiresAt = expiresAt;
    return this;
  }

  withIpAddress(ipAddress: string): this {
    this.ipAddress = ipAddress;
    return this;
  }

  build(): LeadFormSubmissionEntity {
    const e = new LeadFormSubmissionEntity();
    e.id = this.id;
    e.tenantId = this.tenantId;
    e.customerId = this.customerId;
    e.name = this.name;
    e.email = this.email;
    e.phone = this.phone;
    e.answers = this.answers;
    e.submittedAt = this.submittedAt;
    e.expiresAt = this.expiresAt;
    e.ipAddress = this.ipAddress;
    return e;
  }
}
