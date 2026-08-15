import { resolve } from 'node:path';
import { Linter } from 'eslint';

const backendRoot = resolve(__dirname, '../..');
// Load the actual CommonJS flat config rather than duplicating its rules in this spec — see
// persistence-boundary.eslint.spec.ts for why (Linter.verify() runs the same config array
// without Jest's dynamic-import gap).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const productionConfig = require(resolve(backendRoot, 'eslint.config.js')) as Linter.Config[];

describe('TD37-S04 restricted imports/syntax', () => {
  const eslint = new Linter({ configType: 'flat' });

  function lint(source: string, filePath: string) {
    return eslint.verify(source, productionConfig, filePath);
  }

  function ruleIds(messages: Linter.LintMessage[]) {
    return messages.map((message) => message.ruleId).filter(Boolean);
  }

  describe('tier collision regression (TD37-S04 restructure)', () => {
    it('an application-layer file gets every broader-tier restriction simultaneously', () => {
      // Before the TD37-S04 restructure, TD37-S02's broad src/**/*.ts persistence-bypass block
      // silently overrode TD24-S03's ports/shared-domain/event-bus-port/OTel patterns for any
      // application file not in its own ignore list — because ESLint flat config REPLACES (not
      // merges) a rule's options across matching blocks. This fixture proves every tier's
      // restriction now applies together on the same file.
      const messages = lint(
        `
          import { Something } from './ports';
          import { Other } from '../../shared/domain';
          import { EVENT_BUS } from '../../../../shared/ports/event-bus.port';
          import * as Otel from '@opentelemetry/api';
          import { RequestContext } from '../../../../shared/request/request-context';
          import { Repository } from 'typeorm';
          export { Something, Other, EVENT_BUS, Otel, RequestContext, Repository };
        `,
        'src/contexts/booking/application/use-cases/example.use-case.ts',
      );

      const ids = ruleIds(messages);
      expect(ids.filter((id) => id === 'no-restricted-imports').length).toBeGreaterThanOrEqual(6);
      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ message: expect.stringContaining('port file') }),
          expect.objectContaining({ message: expect.stringContaining('domain file') }),
          expect.objectContaining({ message: expect.stringContaining('OUTBOX_PUBLISHER') }),
          expect.objectContaining({ message: expect.stringContaining('@opentelemetry') }),
          expect.objectContaining({ message: expect.stringContaining('RequestContext') }),
          expect.objectContaining({
            message: expect.stringContaining('AGENT_PATTERNS.md Pattern #1'),
          }),
        ]),
      );
    });

    it('a reviewed repository adapter keeps the event-bus-port ban but stays exempt from the persistence-bypass ban', () => {
      const messages = lint(
        `
          import { EVENT_BUS } from '../../../../shared/ports/event-bus.port';
          import { Repository } from 'typeorm';
          export { EVENT_BUS, Repository };
        `,
        'src/contexts/booking/infrastructure/repositories/typeorm-booking.repository.ts',
      );

      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ message: expect.stringContaining('OUTBOX_PUBLISHER') }),
        ]),
      );
      expect(messages).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('AGENT_PATTERNS.md Pattern #1'),
          }),
        ]),
      );
    });

    it('an unreviewed file under infrastructure/repositories/** still fails the persistence-bypass ban', () => {
      const messages = lint(
        "import { Repository } from 'typeorm'; export { Repository };",
        'src/contexts/booking/infrastructure/repositories/unreviewed.repository.ts',
      );

      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('AGENT_PATTERNS.md Pattern #1'),
          }),
        ]),
      );
    });
  });

  describe('RequestContext ban in application layer', () => {
    it('rejects RequestContext imported in a use case', () => {
      const messages = lint(
        "import { RequestContext } from '../../../../shared/request/request-context'; export { RequestContext };",
        'src/contexts/booking/application/use-cases/example.use-case.ts',
      );

      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'no-restricted-imports',
            message: expect.stringContaining('must not inject RequestContext'),
          }),
        ]),
      );
    });

    it('permits RequestContext imported by a controller (infrastructure layer)', () => {
      const messages = lint(
        "import { RequestContext } from '../../../shared/request/request-context'; export { RequestContext };",
        'src/contexts/booking/infrastructure/controllers/booking.controller.ts',
      );

      expect(messages.filter((message) => message.ruleId === 'no-restricted-imports')).toHaveLength(
        0,
      );
    });
  });

  describe('HttpException ban in use cases', () => {
    it('rejects throwing HttpException directly from a use case', () => {
      const messages = lint(
        "import { HttpException } from '@nestjs/common'; function run() { throw new HttpException('nope', 400); }",
        'src/contexts/booking/application/use-cases/example.use-case.ts',
      );

      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'no-restricted-syntax',
            message: expect.stringContaining('must not throw HttpException directly'),
          }),
        ]),
      );
    });

    it('permits mapXxxError() throwing HttpException from the HTTP layer', () => {
      const messages = lint(
        "import { HttpException } from '@nestjs/common'; function mapBookingError(): never { throw new HttpException('nope', 400); }",
        'src/contexts/booking/infrastructure/http/map-booking-error.ts',
      );

      expect(
        messages.filter(
          (message) =>
            message.ruleId === 'no-restricted-syntax' &&
            typeof message.message === 'string' &&
            message.message.includes('HttpException'),
        ),
      ).toHaveLength(0);
    });
  });

  describe('event/trigger name literal ban', () => {
    it('rejects a bare string literal as the first arg to subscribe()', () => {
      const messages = lint(
        "eventBus.subscribe('BookingCompleted', handler, 'consumer');",
        'src/contexts/loyalty/infrastructure/events/example.handler.ts',
      );

      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'no-restricted-syntax',
            message: expect.stringContaining('subscribe()/registerTrigger()'),
          }),
        ]),
      );
    });

    it('rejects a bare string literal as the first arg to registerTrigger()', () => {
      const messages = lint(
        "triggerBus.registerTrigger('cron-reminders', handler, 'consumer');",
        'src/contexts/booking/infrastructure/events/example-trigger.handler.ts',
      );

      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'no-restricted-syntax',
            message: expect.stringContaining('subscribe()/registerTrigger()'),
          }),
        ]),
      );
    });

    it('permits subscribe() called with a class name reference', () => {
      const messages = lint(
        'eventBus.subscribe(BookingCompleted.name, handler, ExampleHandler.CONSUMER_NAME);',
        'src/contexts/loyalty/infrastructure/events/example.handler.ts',
      );

      expect(
        messages.filter(
          (message) =>
            message.ruleId === 'no-restricted-syntax' &&
            typeof message.message === 'string' &&
            message.message.includes('subscribe()/registerTrigger()'),
        ),
      ).toHaveLength(0);
    });
  });
});
