import { checkEventHandlerSuspensionDeclaration } from '../index';
import { expectScannedTargets, expectZeroTargets, fixtureProject } from '../testing/fixtures';

const HANDLER = 'apps/backend/src/contexts/demo/infrastructure/events/demo.handler.ts';

function scan(body: string, file = HANDLER) {
  return checkEventHandlerSuspensionDeclaration(
    fixtureProject({
      [file]: `
        export class DemoHandler {
          onModuleInit(): void {
            ${body}
          }
        }
      `,
    }),
  );
}

describe('checkEventHandlerSuspensionDeclaration', () => {
  describe('positive fixtures (an explicit literal passes)', () => {
    it('passes skipWhenSuspended: true', () => {
      const result = scan(
        `this.eventBus.subscribe(X.name, (e) => this.handle(e), 'c', { skipWhenSuspended: true });`,
      );
      expectScannedTargets(result, 1);
      expect(result.findings).toEqual([]);
    });

    it('passes skipWhenSuspended: false (audit-log, state-sync and Billing sites)', () => {
      const result = scan(
        `this.eventBus.subscribe(X.name, (e) => this.handle(e), 'c', { skipWhenSuspended: false });`,
      );
      expectScannedTargets(result, 1);
      expect(result.findings).toEqual([]);
    });

    it('passes a declaration that also carries requires', () => {
      const result = scan(
        `this.eventBus.subscribe(X.name, (e) => this.handle(e), 'c', { requires: 'LOYALTY', skipWhenSuspended: true });`,
      );
      expect(result.findings).toEqual([]);
    });

    it('reads a bare eventBus receiver as well as this.eventBus', () => {
      const result = scan(
        `eventBus.subscribe(X.name, (e) => this.handle(e), 'c', { skipWhenSuspended: false });`,
      );
      expectScannedTargets(result, 1);
      expect(result.findings).toEqual([]);
    });
  });

  describe('negative fixtures (an undeclared subscription fails)', () => {
    it('flags a three-argument subscribe', () => {
      const result = scan(`this.eventBus.subscribe(X.name, (e) => this.handle(e), 'c');`);
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].message).toContain('no options argument');
    });

    it('flags an options object without the key', () => {
      const result = scan(
        `this.eventBus.subscribe(X.name, (e) => this.handle(e), 'c', { requires: 'LOYALTY' });`,
      );
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].message).toContain('do not state skipWhenSuspended');
    });

    it('flags options passed as a variable the detector cannot read', () => {
      const result = scan(`this.eventBus.subscribe(X.name, (e) => this.handle(e), 'c', OPTS);`);
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].message).toContain('not an object literal');
    });

    it('flags a non-literal value for the flag', () => {
      const result = scan(
        `this.eventBus.subscribe(X.name, (e) => this.handle(e), 'c', { skipWhenSuspended: FLAG });`,
      );
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].message).toContain('must be a literal true or false');
    });

    it('has no exemption: an audit-log handler without the flag fails too', () => {
      const result = scan(
        `this.eventBus.subscribe(X.name, (e) => this.handle(e), 'audit-log');`,
        'apps/backend/src/contexts/booking/infrastructure/events/booking-audit-log.handler.ts',
      );
      expect(result.findings).toHaveLength(1);
    });

    it('reports the line of the call', () => {
      const result = scan(`this.eventBus.subscribe(X.name, (e) => this.handle(e), 'c');`);
      expect(result.findings[0].line).toBeGreaterThan(0);
      expect(result.findings[0].rule).toBe('event-handler-suspension-declaration');
    });
  });

  describe('out of scope', () => {
    it('ignores a subscribe on another receiver (the transport inside GatedEventBus, RxJS)', () => {
      const result = scan(
        `this.transport.subscribe(eventName, handler, consumerName); stream.subscribe(next, error, done);`,
      );
      expectZeroTargets(result);
    });

    it('ignores spec and test files', () => {
      const result = checkEventHandlerSuspensionDeclaration(
        fixtureProject({
          'apps/backend/src/contexts/demo/demo.handler.spec.ts': `
            eventBus.subscribe(X.name, handler, 'c');
          `,
          'apps/backend/src/test/utils/app.ts': `eventBus.subscribe(X.name, handler, 'c');`,
        }),
      );
      expectZeroTargets(result);
    });
  });
});
