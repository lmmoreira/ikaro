import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { toDate } from '../../../../shared/utils/date';
import { IChatbotSessionRepository } from '../../application/ports/chatbot-session-repository.port';
import { ChatbotSession, ChatbotSessionStatus } from '../../domain/chatbot-session.aggregate';
import { ChatbotSessionEntity } from '../entities/chatbot-session.entity';

// UC-035 retention purge: a raw parameterized statement (manager.query() escape hatch, same
// convention as shared/infrastructure/outbox), not the query builder — DeleteQueryBuilder never
// emits a table alias for the DELETE target regardless of what alias is requested via .from(),
// so a correlated NOT EXISTS subquery referencing the row being deleted can't be expressed
// through it. Both date columns are checked against the same $1 cutoff — see the port doc for
// why last_message_at is included, not just started_at.
const DELETE_ORPHANED_SESSIONS_SQL = `
  DELETE FROM "platform"."chatbot_sessions"
  WHERE "started_at" < $1
    AND "last_message_at" < $1
    AND NOT EXISTS (
      SELECT 1 FROM "platform"."chatbot_messages"
      WHERE "chatbot_messages"."tenant_id" = "chatbot_sessions"."tenant_id"
        AND "chatbot_messages"."session_id" = "chatbot_sessions"."id"
    )
  RETURNING "id"
`;

@Injectable()
export class TypeOrmChatbotSessionRepository implements IChatbotSessionRepository {
  constructor(
    @InjectRepository(ChatbotSessionEntity)
    private readonly repo: Repository<ChatbotSessionEntity>,
  ) {}

  async findById(id: string, tenantId: string): Promise<ChatbotSession | null> {
    const entity = await this.repo.findOne({ where: { id, tenantId } });
    return entity ? this.toDomain(entity) : null;
  }

  async countByTenantAndDate(tenantId: string, conversationDate: string): Promise<number> {
    return this.repo.count({ where: { tenantId, conversationDate } });
  }

  async countByTenantIpAndDate(
    tenantId: string,
    clientIp: string,
    conversationDate: string,
  ): Promise<number> {
    return this.repo.count({ where: { tenantId, clientIp, conversationDate } });
  }

  async countActiveSince(tenantId: string, since: Date): Promise<number> {
    return this.repo.count({
      where: { tenantId, status: 'ACTIVE', lastMessageAt: MoreThan(since) },
    });
  }

  async save(session: ChatbotSession): Promise<void> {
    const entity = this.toEntity(session);
    const manager = getActiveEntityManager();
    if (manager) {
      await manager.save(ChatbotSessionEntity, entity);
    } else {
      await this.repo.save(entity);
    }
  }

  async deleteById(id: string, tenantId: string): Promise<void> {
    const manager = getActiveEntityManager();
    if (manager) {
      await manager.delete(ChatbotSessionEntity, { id, tenantId });
    } else {
      await this.repo.delete({ id, tenantId });
    }
  }

  async deleteOrphanedStartedBefore(cutoff: Date): Promise<number> {
    const manager = getActiveEntityManager();
    if (!manager) {
      throw new Error(
        "Chatbot retention purge must run inside ITransactionManager.run() — deleteOrphanedStartedBefore() depends on seeing deleteOlderThan()'s own not-yet-committed effect within the same transaction.",
      );
    }
    const result = (await manager.query(DELETE_ORPHANED_SESSIONS_SQL, [cutoff])) as
      Array<{ id: string }> | [Array<{ id: string }>, number];
    // PostgreSQL's TypeORM transactional EntityManager can return DELETE ... RETURNING as
    // [rows, rowCount] rather than the flat rows array Repository.query() returns — same
    // driver-specific shape TypeOrmOutboxRepository.claimUnpublished() already normalizes.
    // Without this, result.length here would always be 2 (the wrapper array), not the actual
    // deleted-row count.
    const rows = Array.isArray(result[0]) ? result[0] : (result as Array<{ id: string }>);
    return rows.length;
  }

  private toDomain(entity: ChatbotSessionEntity): ChatbotSession {
    return ChatbotSession.reconstitute({
      id: entity.id,
      tenantId: entity.tenantId,
      clientIp: entity.clientIp,
      startedAt: toDate(entity.startedAt),
      lastMessageAt: toDate(entity.lastMessageAt),
      conversationDate: entity.conversationDate,
      messageCount: entity.messageCount,
      status: entity.status as ChatbotSessionStatus,
    });
  }

  private toEntity(session: ChatbotSession): ChatbotSessionEntity {
    const entity = new ChatbotSessionEntity();
    entity.id = session.id;
    entity.tenantId = session.tenantId;
    entity.clientIp = session.clientIp;
    entity.startedAt = session.startedAt;
    entity.lastMessageAt = session.lastMessageAt;
    entity.conversationDate = session.conversationDate;
    entity.messageCount = session.messageCount;
    entity.status = session.status;
    return entity;
  }
}
