import { checkDomainEventsHaveAuditLogSubscription } from '../index';
import { expectScannedTargets, expectZeroTargets, fixtureProject } from '../testing/fixtures';

const EVENT_BASE = `
  export abstract class DomainEvent {}
  export abstract class Command {}
`;

function eventFile(name: string): string {
  return `
    import { DomainEvent } from '../../../../shared/domain/domain-event';
    export class ${name} extends DomainEvent {}
  `;
}

function auditHandler(subscriptions: string): string {
  return `
    import { LogDomainEventUseCase } from '../../../../shared/application/use-cases/log-domain-event.use-case';
    export class DemoAuditLogHandler {
      constructor(private readonly eventBus: any) {}
      onModuleInit() {
        ${subscriptions}
      }
    }
  `;
}

const SUBSCRIBE = (event: string, consumer = 'LogDomainEventUseCase.CONSUMER_NAME') =>
  `this.eventBus.subscribe(${event}.name, (e) => this.handle(e), ${consumer});`;

describe('checkDomainEventsHaveAuditLogSubscription', () => {
  it('passes when every domain event has an audit-log subscription', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/shared/domain/domain-event.ts': EVENT_BASE,
      '/repo/apps/backend/src/contexts/demo/domain/events/alpha-happened.event.ts':
        eventFile('AlphaHappened'),
      '/repo/apps/backend/src/contexts/demo/domain/events/beta-happened.event.ts':
        eventFile('BetaHappened'),
      '/repo/apps/backend/src/contexts/demo/infrastructure/events/demo-audit-log.handler.ts':
        auditHandler(`${SUBSCRIBE('AlphaHappened')}\n${SUBSCRIBE('BetaHappened')}`),
    });

    const result = checkDomainEventsHaveAuditLogSubscription(project);

    expectScannedTargets(result, 2);
    expect(result.findings).toEqual([]);
  });

  it('flags a domain event no handler subscribes to the audit-log consumer', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/shared/domain/domain-event.ts': EVENT_BASE,
      '/repo/apps/backend/src/contexts/demo/domain/events/alpha-happened.event.ts':
        eventFile('AlphaHappened'),
      '/repo/apps/backend/src/contexts/demo/domain/events/beta-happened.event.ts':
        eventFile('BetaHappened'),
      '/repo/apps/backend/src/contexts/demo/infrastructure/events/demo-audit-log.handler.ts':
        auditHandler(SUBSCRIBE('AlphaHappened')),
    });

    const result = checkDomainEventsHaveAuditLogSubscription(project);

    expectScannedTargets(result, 2);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'domain-event-audit-coverage',
        file: '/repo/apps/backend/src/contexts/demo/domain/events/beta-happened.event.ts',
        message: expect.stringContaining('Domain event BetaHappened has no audit-log subscription'),
      }),
    ]);
  });

  it('does not count a subscription made with a different consumer name', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/shared/domain/domain-event.ts': EVENT_BASE,
      '/repo/apps/backend/src/contexts/demo/domain/events/alpha-happened.event.ts':
        eventFile('AlphaHappened'),
      '/repo/apps/backend/src/contexts/demo/infrastructure/events/demo-notification.handler.ts': `
        export class DemoNotificationHandler {
          static readonly CONSUMER_NAME = 'notification';
          constructor(private readonly eventBus: any) {}
          onModuleInit() {
            ${SUBSCRIBE('AlphaHappened', 'DemoNotificationHandler.CONSUMER_NAME')}
          }
        }
      `,
    });

    const result = checkDomainEventsHaveAuditLogSubscription(project);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].message).toContain('AlphaHappened');
  });

  it('does not count a string-literal event name or a spec-file subscription', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/shared/domain/domain-event.ts': EVENT_BASE,
      '/repo/apps/backend/src/contexts/demo/domain/events/alpha-happened.event.ts':
        eventFile('AlphaHappened'),
      '/repo/apps/backend/src/contexts/demo/infrastructure/events/demo-audit-log.handler.ts':
        auditHandler(
          `this.eventBus.subscribe('AlphaHappened', (e) => this.handle(e), LogDomainEventUseCase.CONSUMER_NAME);`,
        ),
      '/repo/apps/backend/src/contexts/demo/infrastructure/events/demo-audit-log.handler.spec.ts':
        auditHandler(SUBSCRIBE('AlphaHappened')),
    });

    const result = checkDomainEventsHaveAuditLogSubscription(project);

    expect(result.findings).toHaveLength(1);
  });

  it('ignores a Command and any class outside domain/events', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/shared/domain/domain-event.ts': EVENT_BASE,
      '/repo/apps/backend/src/contexts/demo/domain/events/alpha-happened.event.ts':
        eventFile('AlphaHappened'),
      '/repo/apps/backend/src/contexts/demo/domain/commands/reminder-due.command.ts': `
        import { Command } from '../../../../shared/domain/command';
        export class ReminderDue extends Command {}
      `,
      '/repo/apps/backend/src/test/infrastructure/stub-event.ts': eventFile('StubEvent'),
      '/repo/apps/backend/src/contexts/demo/infrastructure/events/demo-audit-log.handler.ts':
        auditHandler(SUBSCRIBE('AlphaHappened')),
    });

    const result = checkDomainEventsHaveAuditLogSubscription(project);

    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([]);
  });

  it('reports zero targets when no domain event exists', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/shared/domain/domain-event.ts': EVENT_BASE,
    });

    expectZeroTargets(checkDomainEventsHaveAuditLogSubscription(project));
  });
});
