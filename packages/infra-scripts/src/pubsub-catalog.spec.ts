import { buildPubSubCatalog } from './pubsub-catalog';

describe('buildPubSubCatalog', () => {
  it('resolves ClassName.name as the topic name (the common subscribe() shape)', () => {
    const sources = new Map([
      [
        '/virtual/handler.ts',
        `
          class Handler {
            constructor(private eventBus: EventBus) {}
            onModuleInit() {
              this.eventBus.subscribe<SomeEvent>(SomeEvent.name, (e) => this.handle(e), 'notification');
            }
          }
        `,
      ],
    ]);

    expect(buildPubSubCatalog(sources)).toEqual([
      { event: 'SomeEvent', consumers: ['notification'] },
    ]);
  });

  it('groups multiple consumers of the same topic across different files, sorted deterministically', () => {
    const sources = new Map([
      [
        '/virtual/staff-handler.ts',
        `class StaffHandler {
          init() { this.eventBus.subscribe<TenantProvisioned>(TenantProvisioned.name, h, 'staff'); }
        }`,
      ],
      [
        '/virtual/notification-handler.ts',
        `class NotificationHandler {
          init() {
            this.eventBus.subscribe<TenantProvisioned>(
              TenantProvisioned.name,
              h,
              'notification-template-seed',
            );
          }
        }`,
      ],
    ]);

    expect(buildPubSubCatalog(sources)).toEqual([
      { event: 'TenantProvisioned', consumers: ['notification-template-seed', 'staff'] },
    ]);
  });

  it('resolves a same-file static class property for the consumer name (cron trigger shape)', () => {
    const sources = new Map([
      [
        '/virtual/booking-reminder-trigger.handler.ts',
        `
          import { CRON_REMINDERS_TRIGGER } from './cron-trigger-names.constants';

          class BookingReminderTriggerHandler {
            static readonly CONSUMER_NAME = 'booking-reminder';
            init() {
              this.triggerBus.registerTrigger(
                CRON_REMINDERS_TRIGGER,
                () => this.handle(),
                BookingReminderTriggerHandler.CONSUMER_NAME,
              );
            }
          }
        `,
      ],
      [
        '/virtual/cron-trigger-names.constants.ts',
        `export const CRON_REMINDERS_TRIGGER = 'cron-reminders';`,
      ],
    ]);

    expect(buildPubSubCatalog(sources)).toEqual([
      { event: 'cron-reminders', consumers: ['booking-reminder'] },
    ]);
  });

  it('resolves a cross-file static class property for the consumer name (use-case CONSUMER_NAME shape)', () => {
    const sources = new Map([
      [
        '/virtual/booking-completed.handler.ts',
        `
          class BookingCompletedHandler {
            init() {
              this.eventBus.subscribe<BookingCompleted>(
                BookingCompleted.name,
                (e) => this.handle(e),
                CompleteBookingLoyaltyEffectsUseCase.CONSUMER_NAME,
              );
            }
          }
        `,
      ],
      [
        '/virtual/complete-booking-loyalty-effects.use-case.ts',
        `
          class CompleteBookingLoyaltyEffectsUseCase {
            static readonly CONSUMER_NAME = 'complete-booking-loyalty-effects';
          }
        `,
      ],
    ]);

    expect(buildPubSubCatalog(sources)).toEqual([
      { event: 'BookingCompleted', consumers: ['complete-booking-loyalty-effects'] },
    ]);
  });

  it('handles a literal topic name that does not match its generic type argument (dead-letter shape)', () => {
    const sources = new Map([
      [
        '/virtual/dead-letter.handler.ts',
        `
          class DeadLetterHandler {
            init() {
              this.eventBus.subscribe<Envelope>('dead-letter', (e) => this.handle(e), 'monitor');
            }
          }
        `,
      ],
    ]);

    expect(buildPubSubCatalog(sources)).toEqual([{ event: 'dead-letter', consumers: ['monitor'] }]);
  });

  it('ignores an unrelated .subscribe() call with fewer than 3 arguments (e.g. RxJS)', () => {
    const sources = new Map([
      [
        '/virtual/interceptor.ts',
        `
          class RequestInterceptor {
            intercept(ctx, next) {
              return next.handle().subscribe(subscriber);
            }
          }
        `,
      ],
    ]);

    expect(buildPubSubCatalog(sources)).toEqual([]);
  });

  it('ignores an unrelated .subscribe() call on a receiver other than eventBus, even with 3 arguments', () => {
    const sources = new Map([
      [
        '/virtual/webhook-registry.ts',
        `
          class WebhookRegistry {
            init() {
              this.webhooks.subscribe(SomeTopic.name, (e) => this.handle(e), 'some-consumer');
            }
          }
        `,
      ],
    ]);

    expect(buildPubSubCatalog(sources)).toEqual([]);
  });

  it('throws when a call-site argument cannot be resolved to a literal string', () => {
    const sources = new Map([
      [
        '/virtual/handler.ts',
        `
          class Handler {
            init() {
              this.eventBus.subscribe(getDynamicName(), h, 'notification');
            }
          }
        `,
      ],
    ]);

    expect(() => buildPubSubCatalog(sources)).toThrow(/cannot resolve a literal string value/);
  });

  it('throws when two files export the same constant name with conflicting values', () => {
    const sources = new Map([
      ['/virtual/a.ts', `export const SHARED_NAME = 'value-a';`],
      ['/virtual/b.ts', `export const SHARED_NAME = 'value-b';`],
    ]);

    expect(() => buildPubSubCatalog(sources)).toThrow(/conflicting values for "SHARED_NAME"/);
  });
});
