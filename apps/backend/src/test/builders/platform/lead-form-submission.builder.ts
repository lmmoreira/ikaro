import { Email } from '../../../shared/value-objects/email.vo';
import { PhoneNumber } from '../../../shared/value-objects/phone-number.vo';
import { uuidv7 } from '../../../shared/domain/uuid-v7';
import {
  LeadFormAnswer,
  LeadFormSubmission,
} from '../../../contexts/platform/domain/lead-form-submission.aggregate';

const DEFAULT_TENANT_ID = '01234567-0000-7000-8000-000000000001';
const DEFAULT_IP_ADDRESS = '203.0.113.10';

export class LeadFormSubmissionBuilder {
  private id = uuidv7();
  private tenantId = DEFAULT_TENANT_ID;
  private customerId: string | null = null;
  private name = 'Maria Silva';
  private email = 'lead@example.com';
  private phone = '+5511912345678';
  private answers: LeadFormAnswer[] = [];
  private submittedAt = new Date('2026-01-01T12:00:00.000Z');
  private expiresAt = new Date('2026-07-01T12:00:00.000Z');
  private ipAddress = DEFAULT_IP_ADDRESS;

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

  build(): LeadFormSubmission {
    return LeadFormSubmission.reconstitute({
      id: this.id,
      tenantId: this.tenantId,
      customerId: this.customerId,
      name: this.name,
      email: Email.reconstitute(this.email),
      phone: PhoneNumber.reconstitute(this.phone),
      answers: this.answers,
      submittedAt: this.submittedAt,
      expiresAt: this.expiresAt,
      ipAddress: this.ipAddress,
    });
  }
}
