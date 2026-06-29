import { NotificationLog } from './notification-log.aggregate';

const BASE_PROPS = {
  tenantId: 'aaaaaaaa-0000-4000-8000-000000000001',
  eventId: 'bbbbbbbb-0000-4000-8000-000000000001',
  notificationType: 'booking-approved-customer',
  channel: 'EMAIL',
  recipientEmail: 'joao@example.com',
};

describe('NotificationLog', () => {
  describe('create()', () => {
    it('produces status PENDING with retryCount 0', () => {
      const log = NotificationLog.create(BASE_PROPS);

      expect(log.status).toBe('PENDING');
      expect(log.retryCount).toBe(0);
      expect(log.errorMessage).toBeUndefined();
      expect(log.sentAt).toBeUndefined();
      expect(log.id).toBeDefined();
      expect(log.tenantId).toBe(BASE_PROPS.tenantId);
      expect(log.recipientEmail.address).toBe(BASE_PROPS.recipientEmail);
    });
  });

  describe('markSent()', () => {
    it('transitions to SENT and sets sentAt', () => {
      const log = NotificationLog.create(BASE_PROPS);
      log.markSent();

      expect(log.status).toBe('SENT');
      expect(log.sentAt).toBeInstanceOf(Date);
      expect(log.retryCount).toBe(0);
    });
  });

  describe('markFailed()', () => {
    it('transitions to FAILED, increments retryCount, stores errorMessage', () => {
      const log = NotificationLog.create(BASE_PROPS);
      log.markFailed('SMTP connection refused');

      expect(log.status).toBe('FAILED');
      expect(log.retryCount).toBe(1);
      expect(log.errorMessage).toBe('SMTP connection refused');
      expect(log.sentAt).toBeUndefined();
    });

    it('increments retryCount on repeated failures', () => {
      const log = NotificationLog.create(BASE_PROPS);
      log.markFailed('first');
      log.markFailed('second');

      expect(log.retryCount).toBe(2);
      expect(log.errorMessage).toBe('second');
    });
  });

  describe('reconstitute()', () => {
    it('restores all props without re-validating', () => {
      const sentAt = new Date('2026-06-01T12:00:00Z');
      const createdAt = new Date('2026-06-01T10:00:00Z');

      const log = NotificationLog.reconstitute({
        id: 'some-id',
        tenantId: BASE_PROPS.tenantId,
        eventId: BASE_PROPS.eventId,
        notificationType: BASE_PROPS.notificationType,
        channel: BASE_PROPS.channel,
        recipientEmail: BASE_PROPS.recipientEmail,
        status: 'SENT',
        retryCount: 2,
        errorMessage: 'prev error',
        sentAt,
        createdAt,
      });

      expect(log.id).toBe('some-id');
      expect(log.status).toBe('SENT');
      expect(log.retryCount).toBe(2);
      expect(log.errorMessage).toBe('prev error');
      expect(log.sentAt).toBe(sentAt);
      expect(log.createdAt).toBe(createdAt);
    });
  });
});
