import { ChatbotSession } from './chatbot-session.aggregate';

const BASE_PROPS = {
  tenantId: 'aaaaaaaa-0000-4000-8000-000000000001',
  clientIp: '203.0.113.10',
  conversationDate: '2026-08-09',
};

describe('ChatbotSession', () => {
  describe('create()', () => {
    it('produces status ACTIVE with messageCount 0', () => {
      const session = ChatbotSession.create(BASE_PROPS);

      expect(session.status).toBe('ACTIVE');
      expect(session.messageCount).toBe(0);
      expect(session.id).toBeDefined();
      expect(session.tenantId).toBe(BASE_PROPS.tenantId);
      expect(session.clientIp).toBe(BASE_PROPS.clientIp);
      expect(session.conversationDate).toBe(BASE_PROPS.conversationDate);
      expect(session.startedAt).toBeInstanceOf(Date);
      expect(session.lastMessageAt).toEqual(session.startedAt);
    });
  });

  describe('recordMessage()', () => {
    it('increments messageCount and updates lastMessageAt', () => {
      const session = ChatbotSession.create(BASE_PROPS);
      const startedLastMessageAt = session.lastMessageAt;

      session.recordMessage();

      expect(session.messageCount).toBe(1);
      expect(session.lastMessageAt.getTime()).toBeGreaterThanOrEqual(
        startedLastMessageAt.getTime(),
      );
    });

    it('accumulates across repeated calls', () => {
      const session = ChatbotSession.create(BASE_PROPS);
      session.recordMessage();
      session.recordMessage();
      session.recordMessage();

      expect(session.messageCount).toBe(3);
    });
  });

  describe('markCapped()', () => {
    it('transitions to CAPPED', () => {
      const session = ChatbotSession.create(BASE_PROPS);
      session.markCapped();

      expect(session.status).toBe('CAPPED');
    });
  });

  describe('close()', () => {
    it('transitions to CLOSED', () => {
      const session = ChatbotSession.create(BASE_PROPS);
      session.close();

      expect(session.status).toBe('CLOSED');
    });
  });

  describe('reconstitute()', () => {
    it('restores all props without re-validating', () => {
      const startedAt = new Date('2026-08-09T10:00:00Z');
      const lastMessageAt = new Date('2026-08-09T10:05:00Z');

      const session = ChatbotSession.reconstitute({
        id: 'some-id',
        tenantId: BASE_PROPS.tenantId,
        clientIp: BASE_PROPS.clientIp,
        startedAt,
        lastMessageAt,
        conversationDate: BASE_PROPS.conversationDate,
        messageCount: 5,
        status: 'CAPPED',
      });

      expect(session.id).toBe('some-id');
      expect(session.startedAt).toBe(startedAt);
      expect(session.lastMessageAt).toBe(lastMessageAt);
      expect(session.messageCount).toBe(5);
      expect(session.status).toBe('CAPPED');
    });
  });
});
