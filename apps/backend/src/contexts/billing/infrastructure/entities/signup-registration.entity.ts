import { Column, Entity, PrimaryColumn } from 'typeorm';

// No `tenant_id` until the registration completes (S11): the row is created before the tenant
// exists, so it is a documented tenant-id exemption (docs/TENANT_ISOLATION_STRATEGY.md).
@Entity('signup_registrations', { schema: 'billing' })
export class SignupRegistrationEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId!: string | null;

  @Column({ type: 'varchar', length: 12 })
  source!: string;

  @Column({ type: 'varchar', length: 10 })
  status!: string;

  @Column({ name: 'google_sub', type: 'varchar', length: 100, nullable: true })
  googleSub!: string | null;

  @Column({ name: 'tax_id_type', type: 'varchar', length: 10, nullable: true })
  taxIdType!: string | null;

  @Column({ name: 'tax_id', type: 'varchar', length: 32, nullable: true })
  taxId!: string | null;

  @Column({ name: 'terms_version', type: 'varchar', length: 20, nullable: true })
  termsVersion!: string | null;

  @Column({ name: 'terms_accepted_at', type: 'timestamptz', nullable: true })
  termsAcceptedAt!: Date | null;

  @Column({ type: 'boolean', default: false })
  exempt!: boolean;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
