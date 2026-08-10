import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('chatbot_messages', { schema: 'platform' })
@Index('IDX_chatbot_messages_tenant_session', ['tenantId', 'sessionId'])
@Index('IDX_chatbot_messages_created_at', ['createdAt'])
export class ChatbotMessageEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ type: 'varchar', length: 9 })
  role!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({ name: 'input_tokens', type: 'integer', default: 0 })
  inputTokens!: number;

  @Column({ name: 'output_tokens', type: 'integer', default: 0 })
  outputTokens!: number;

  @Column({ name: 'model_id', type: 'varchar', length: 100 })
  modelId!: string;

  @Column({ name: 'created_at', type: 'timestamptz', update: false })
  createdAt!: Date;
}
