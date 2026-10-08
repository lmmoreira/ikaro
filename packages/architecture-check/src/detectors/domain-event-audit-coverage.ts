import { ClassDeclaration, Node, Project, SyntaxKind } from 'ts-morph';
import type { Finding, ScanResult } from '../model';
import { sourceLine } from '../project';

const RULE = 'domain-event-audit-coverage';
const DOMAIN_EVENT_FILE = /\/contexts\/[^/]+\/domain\/events\/[^/]+\.event\.ts$/;
const AUDIT_CONSUMER_REFERENCE = 'LogDomainEventUseCase.CONSUMER_NAME';

// Every concrete class that directly extends `DomainEvent` under `contexts/*/domain/events/`.
// A `Command` (cron-style instruction, `shared/domain/command.ts`) extends a different base and
// lives under `domain/commands/`, so it is out of scope by construction, not by an exclusion list.
function findDomainEventClasses(project: Project): ClassDeclaration[] {
  const classes: ClassDeclaration[] = [];
  for (const sourceFile of project.getSourceFiles()) {
    if (!DOMAIN_EVENT_FILE.test(sourceFile.getFilePath())) continue;
    for (const declaration of sourceFile.getDescendantsOfKind(SyntaxKind.ClassDeclaration)) {
      if (declaration.isAbstract()) continue;
      if (declaration.getExtends()?.getExpression().getText() === 'DomainEvent') {
        classes.push(declaration);
      }
    }
  }
  return classes;
}

// The event name of every `<anything>.eventBus.subscribe(<Event>.name, <handler>,
// LogDomainEventUseCase.CONSUMER_NAME)` call: the exact call-site shape
// packages/infra-scripts/src/pubsub-catalog.ts resolves into an `audit-log` subscription, and the
// only one ESLint's SUBSCRIBE_REGISTER_TRIGGER_LITERAL_SELECTOR leaves a handler free to write.
function findAuditSubscribedEventNames(project: Project): Set<string> {
  const names = new Set<string>();
  for (const sourceFile of project.getSourceFiles()) {
    if (sourceFile.getBaseName().endsWith('.spec.ts')) continue;
    for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const callee = call.getExpression();
      if (!Node.isPropertyAccessExpression(callee) || callee.getName() !== 'subscribe') continue;
      const receiver = callee.getExpression();
      const receiverName = Node.isPropertyAccessExpression(receiver)
        ? receiver.getName()
        : receiver.getText();
      if (receiverName !== 'eventBus') continue;

      const [eventArg, , consumerArg] = call.getArguments();
      if (!eventArg || !consumerArg) continue;
      if (consumerArg.getText() !== AUDIT_CONSUMER_REFERENCE) continue;
      if (!Node.isPropertyAccessExpression(eventArg) || eventArg.getName() !== 'name') continue;
      names.add(eventArg.getExpression().getText());
    }
  }
  return names;
}

// M23-S36: the shared `audit-log` consumer must cover every domain event, so a new event cannot
// ship unaudited — and, because that subscription is also what gives the event a real Pub/Sub
// topic, cannot be drained into the outbox with no topic at all (docs/ANTI_PATTERNS.md § A domain
// event is drained; `StaffActivated` shipped that way before this detector existed).
export function checkDomainEventsHaveAuditLogSubscription(project: Project): ScanResult {
  const eventClasses = findDomainEventClasses(project);
  const subscribed = findAuditSubscribedEventNames(project);

  const findings: Finding[] = [];
  for (const declaration of eventClasses) {
    const name = declaration.getName();
    if (!name || subscribed.has(name)) continue;
    findings.push({
      rule: RULE,
      file: declaration.getSourceFile().getFilePath(),
      line: sourceLine(declaration.getSourceFile(), declaration.getStart()),
      message:
        `Domain event ${name} has no audit-log subscription. Add ` +
        `\`this.eventBus.subscribe(${name}.name, (event) => this.handle(event), ` +
        `${AUDIT_CONSUMER_REFERENCE})\` to its context's <Context>AuditLogHandler ` +
        `(infrastructure/events/), then regenerate infra/terraform/pubsub-catalog.json.`,
    });
  }

  return { rule: RULE, scannedTargets: eventClasses.length, findings };
}
