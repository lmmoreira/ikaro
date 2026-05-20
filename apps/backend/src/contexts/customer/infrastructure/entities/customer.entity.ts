import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';

@Entity('customers', { schema: 'customer' })
@Index(['tenantId'])
@Unique('UQ_customer_customers_tenant_oauth', ['tenantId', 'googleOAuthId'])
export class CustomerEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'google_oauth_id', type: 'varchar', length: 255 })
  googleOAuthId!: string;

  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone!: string | null;

  @Column({ name: 'default_address', type: 'jsonb', nullable: true })
  defaultAddress!: Record<string, unknown> | null;

  @Column({ name: 'created_at', type: 'timestamptz', update: false })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
