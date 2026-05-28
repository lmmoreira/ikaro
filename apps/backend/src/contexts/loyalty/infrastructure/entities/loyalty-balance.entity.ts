import { Column, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('loyalty_balances', { schema: 'loyalty' })
@Index('IDX_loyalty_balances_tenant_customer', ['tenantId', 'customerId'])
export class LoyaltyBalanceEntity {
  @PrimaryColumn({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @PrimaryColumn({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @Column({ name: 'current_points', type: 'int', default: 0 })
  currentPoints!: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
