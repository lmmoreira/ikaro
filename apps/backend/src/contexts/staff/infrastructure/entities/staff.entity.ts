import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('staff', { schema: 'staff' })
@Index(['tenantId'])
@Index(['tenantId', 'email'])
@Index(['tenantId', 'googleOAuthId'])
@Index('UQ_staff_staff_google_oauth_id', ['googleOAuthId'], {
  unique: true,
  where: '"google_oauth_id" IS NOT NULL',
})
export class StaffEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'google_oauth_id', type: 'varchar', length: 255, nullable: true })
  googleOAuthId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name!: string | null;

  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ type: 'varchar', length: 20 })
  role!: string;

  @Column({ name: 'is_active', type: 'boolean', default: false })
  isActive!: boolean;

  @Column({ name: 'invited_by', type: 'uuid', nullable: true })
  invitedBy!: string | null;

  @Column({ name: 'deactivated_by', type: 'uuid', nullable: true })
  deactivatedBy!: string | null;

  @Column({ name: 'created_at', type: 'timestamptz', update: false })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
