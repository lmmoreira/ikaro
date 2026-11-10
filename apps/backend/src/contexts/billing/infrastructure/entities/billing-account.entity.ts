import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { AddressProps } from '../../../../shared/value-objects/address';

// One row per tenant (`UQ_billing_billing_accounts_tenant`). There is deliberately NO country
// column: the billing country is the subscription's immutable `country_code`, and the repository
// hydrates it from there. Tax identity is financial data and lives only here.
@Entity('billing_accounts', { schema: 'billing' })
export class BillingAccountEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'tax_id_type', type: 'varchar', length: 10, nullable: true })
  taxIdType!: string | null;

  @Column({ name: 'tax_id', type: 'varchar', length: 32, nullable: true })
  taxId!: string | null;

  @Column({ name: 'legal_name', type: 'varchar', length: 255, nullable: true })
  legalName!: string | null;

  @Column({ name: 'billing_email', type: 'varchar', length: 255, nullable: true })
  billingEmail!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  address!: AddressProps | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  provider!: string | null;

  @Column({ name: 'provider_customer_id', type: 'varchar', length: 100, nullable: true })
  providerCustomerId!: string | null;

  @Column({ name: 'auto_billing', type: 'varchar', length: 20, default: 'NONE' })
  autoBilling!: string;

  @Column({ name: 'auto_billing_status', type: 'varchar', length: 25, default: 'INACTIVE' })
  autoBillingStatus!: string;

  @Column({ name: 'auto_billing_label', type: 'varchar', length: 100, nullable: true })
  autoBillingLabel!: string | null;

  @Column({ name: 'terms_version', type: 'varchar', length: 20, nullable: true })
  termsVersion!: string | null;

  @Column({ name: 'terms_accepted_at', type: 'timestamptz', nullable: true })
  termsAcceptedAt!: Date | null;

  @Column({ name: 'terms_accepted_by', type: 'varchar', length: 255, nullable: true })
  termsAcceptedBy!: string | null;

  @Column({ name: 'created_at', type: 'timestamptz', insert: false, update: false })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
