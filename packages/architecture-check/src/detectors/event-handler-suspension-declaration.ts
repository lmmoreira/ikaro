import { Node, Project, SyntaxKind, type CallExpression } from 'ts-morph';
import type { Finding, ScanResult } from '../model';
import { sourceLine } from '../project';

export const EVENT_HANDLER_SUSPENSION_RULE = 'event-handler-suspension-declaration';

// Same receiver rule as `packages/infra-scripts/src/pubsub-catalog.ts` (`BUS_METHOD_RECEIVERS`): a
// `subscribe` call is an event subscription when its receiver is `eventBus` (`eventBus.subscribe`
// or `this.eventBus.subscribe`). A subscription through another receiver name is invisible to the
// Pub/Sub catalog too, so it is out of this detector's reach by the same rule.
const EVENT_BUS_RECEIVER = 'eventBus';
// `subscribe(eventName, handler, consumerName, options?)`: the catalog scanner also requires three.
const MIN_ARGUMENTS = 3;
const OPTIONS_ARGUMENT_INDEX = 3;
const DECLARATION_KEY = 'skipWhenSuspended';
const TEST_OR_SPEC_FILE = /(\.spec\.ts$|\.test\.ts$|\/test\/)/;

/**
 * Every event subscription must state whether it runs for a suspended tenant (UC-125, M25-S21a):
 * `subscribe(Event.name, handler, CONSUMER, { skipWhenSuspended: true | false })`. The runtime
 * default is to run, so a forgotten flag would silently email a suspended tenant's customers; this
 * forces the decision to be visible at the call site. The detector forces an explicit value, not
 * the right one: a spec pins the declared value of the handlers where the wrong one would be
 * harmful.
 *
 * Strict by design: the fourth argument must be an object literal that carries `skipWhenSuspended`
 * set to a literal `true` or `false`. A variable, a missing key or a non-boolean value is a
 * finding, because the detector reads source text and cannot see what a variable holds. There is
 * no exemption: the audit-log handlers declare `false` like every other site.
 *
 * `scannedTargets` counts the subscription call sites examined.
 */
export function checkEventHandlerSuspensionDeclaration(backend: Project): ScanResult {
  const findings: Finding[] = [];
  let scannedTargets = 0;

  for (const sourceFile of backend.getSourceFiles()) {
    if (TEST_OR_SPEC_FILE.test(sourceFile.getFilePath())) continue;
    for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      if (!isEventSubscription(call)) continue;
      scannedTargets++;
      const problem = declarationProblem(call);
      if (!problem) continue;
      findings.push({
        rule: EVENT_HANDLER_SUSPENSION_RULE,
        file: sourceFile.getFilePath(),
        line: sourceLine(sourceFile, call.getStart()),
        message: `${problem} Pass { ${DECLARATION_KEY}: true } for a handler that sends something outbound, or { ${DECLARATION_KEY}: false } for audit-log, state-sync and Billing handlers (docs/ENGINEERING_RULES_SHARED.md § Tenant access enforcement, item 3).`,
      });
    }
  }

  return { rule: EVENT_HANDLER_SUSPENSION_RULE, scannedTargets, findings };
}

function isEventSubscription(call: CallExpression): boolean {
  const callee = call.getExpression();
  if (!Node.isPropertyAccessExpression(callee) || callee.getName() !== 'subscribe') return false;
  if (call.getArguments().length < MIN_ARGUMENTS) return false;
  const receiver = callee.getExpression();
  const receiverName = Node.isIdentifier(receiver)
    ? receiver.getText()
    : Node.isPropertyAccessExpression(receiver)
      ? receiver.getName()
      : undefined;
  return receiverName === EVENT_BUS_RECEIVER;
}

function declarationProblem(call: CallExpression): string | undefined {
  const options = call.getArguments()[OPTIONS_ARGUMENT_INDEX];
  if (!options) {
    return `subscribe() has no options argument, so it does not state ${DECLARATION_KEY}.`;
  }
  if (!Node.isObjectLiteralExpression(options)) {
    return `subscribe() passes its options as ${options.getText()}, not an object literal; the detector cannot read ${DECLARATION_KEY} from a variable.`;
  }
  const property = options
    .getProperties()
    .find(
      (candidate) =>
        Node.isPropertyAssignment(candidate) && candidate.getName() === DECLARATION_KEY,
    );
  if (!property || !Node.isPropertyAssignment(property)) {
    return `subscribe() options do not state ${DECLARATION_KEY}.`;
  }
  // `{ skipWhenSuspended: true, ...OPTS }`: a later spread can overwrite the literal with a value the
  // detector cannot read, so only a spread placed before the key (which the key then wins over) is safe.
  const spreadAfterKey = options
    .getProperties()
    .some(
      (candidate) =>
        Node.isSpreadAssignment(candidate) && candidate.getStart() > property.getStart(),
    );
  if (spreadAfterKey) {
    return `subscribe() spreads another object after ${DECLARATION_KEY}, which can overwrite the literal.`;
  }
  const initializer = property.getInitializer();
  const literal = initializer?.getText();
  if (literal !== 'true' && literal !== 'false') {
    return `subscribe() sets ${DECLARATION_KEY} to ${literal ?? 'nothing'}; it must be a literal true or false.`;
  }
  return undefined;
}
