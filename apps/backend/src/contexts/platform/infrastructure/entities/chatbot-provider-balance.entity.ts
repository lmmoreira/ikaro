import { Column, Entity, PrimaryColumn } from 'typeorm';

// No tenant_id column — deliberate exemption, not an oversight. This is platform-operator/vendor
// balance data (Ikaro's own prepaid balance with an LLM provider), not tenant business data; see
// docs/06-TENANT_ISOLATION_STRATEGY.md § Documented exemption: platform-operator data.
@Entity('chatbot_provider_balance', { schema: 'platform' })
export class ChatbotProviderBalanceEntity {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  provider!: string;

  @Column({ name: 'remaining_usd', type: 'numeric', precision: 10, scale: 4 })
  remainingUsd!: string;

  @Column({ name: 'checked_at', type: 'timestamptz' })
  checkedAt!: Date;
}
