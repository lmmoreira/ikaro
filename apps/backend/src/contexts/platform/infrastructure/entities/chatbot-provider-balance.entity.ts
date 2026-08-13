import { Column, Entity, PrimaryColumn } from 'typeorm';

// No tenant_id column — deliberate exemption, not an oversight. This is platform-operator/vendor
// balance data (Ikaro's own prepaid balance with an LLM provider), not tenant business data; see
// docs/06-TENANT_ISOLATION_STRATEGY.md § Documented exemption: platform-operator data.
// remainingUsd/checkedAt (S08's balance poll) and lastSuccessAt/lastFailureAt (S05/S06's health
// signal) are two independent write paths on the same row — see docs/13-DATABASE_SCHEMA.md's
// "Write discipline" note. Every column is nullable and independently settable so a partial
// upsert (TypeOrmChatbotProviderBalanceRepository's saveBalance()/recordCallOutcome()) can touch
// only the columns it owns, never clobbering the other writer's data.
@Entity('chatbot_provider_balance', { schema: 'platform' })
export class ChatbotProviderBalanceEntity {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  provider!: string;

  @Column({ name: 'remaining_usd', type: 'numeric', precision: 10, scale: 4, nullable: true })
  remainingUsd?: string | null;

  @Column({ name: 'checked_at', type: 'timestamptz', nullable: true })
  checkedAt?: Date | null;

  @Column({ name: 'last_success_at', type: 'timestamptz', nullable: true })
  lastSuccessAt?: Date | null;

  @Column({ name: 'last_failure_at', type: 'timestamptz', nullable: true })
  lastFailureAt?: Date | null;
}
