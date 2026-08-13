import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('chatbot_sessions', { schema: 'platform' })
@Index('IDX_chatbot_sessions_tenant_conversation_date', ['tenantId', 'conversationDate'])
@Index('IDX_chatbot_sessions_tenant_ip_conversation_date', [
  'tenantId',
  'clientIp',
  'conversationDate',
])
@Index('IDX_chatbot_sessions_tenant_status_last_message', ['tenantId', 'status', 'lastMessageAt'])
@Index('IDX_chatbot_sessions_started_at_last_message_at', ['startedAt', 'lastMessageAt'])
export class ChatbotSessionEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'client_ip', type: 'varchar', length: 45 })
  clientIp!: string;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt!: Date;

  @Column({ name: 'last_message_at', type: 'timestamptz' })
  lastMessageAt!: Date;

  @Column({ name: 'conversation_date', type: 'date' })
  conversationDate!: string;

  @Column({ name: 'message_count', type: 'smallint', default: 0 })
  messageCount!: number;

  @Column({ type: 'varchar', length: 10, default: 'ACTIVE' })
  status!: string;
}
