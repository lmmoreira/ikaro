import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('chatbot_provider_balance', { schema: 'platform' })
export class ChatbotProviderBalanceEntity {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  provider!: string;

  @Column({ name: 'remaining_usd', type: 'numeric', precision: 10, scale: 4 })
  remainingUsd!: string;

  @Column({ name: 'checked_at', type: 'timestamptz' })
  checkedAt!: Date;
}
