import {
  ClassDeclaration,
  InterfaceDeclaration,
  Node,
  ParameterDeclaration,
  Project,
  SyntaxKind,
  Type,
} from 'ts-morph';
import type { Finding, ScanResult } from '../model';
import { sourceLine } from '../project';

const PORT_OR_REPOSITORY_NAME = /^I.*(?:Repository|Port)$/;
const PORTS_DIR_SEGMENT = '/ports/';

// Matches docs/ANTI_PATTERNS.md's naming convention (I*Repository/I*Port) for every current
// interface — with one documented exception, `shared/ports/cache.port.ts`'s `CachePort`, which
// has no `I` prefix. The `**/ports/**` path fallback is what still catches that one; both
// branches are kept (not just the path check, even though it alone covers 100% of today's
// interfaces) so a future port declared outside a `ports/` directory is still caught by name.
function isPortOrRepositoryInterface(declaration: InterfaceDeclaration): boolean {
  if (PORT_OR_REPOSITORY_NAME.test(declaration.getName())) return true;
  return declaration.getSourceFile().getFilePath().includes(PORTS_DIR_SEGMENT);
}

function resolvePortInterfaceName(type: Type): string | undefined {
  const declarations = type.getSymbol()?.getDeclarations() ?? [];
  for (const declaration of declarations) {
    if (Node.isInterfaceDeclaration(declaration) && isPortOrRepositoryInterface(declaration)) {
      return declaration.getName();
    }
  }
  return undefined;
}

// Follows the import-alias chain to the concrete class a `new X(...)` constructs — same
// approach as test-builder-coverage.ts's resolveConstructedClass, duplicated locally to keep
// each detector module self-contained (per this package's existing convention).
function resolveConstructedClass(identifier: Node): ClassDeclaration | undefined {
  if (!Node.isIdentifier(identifier)) return undefined;
  let symbol = identifier.getSymbol();
  if (!symbol) return undefined;
  symbol = symbol.getAliasedSymbol() ?? symbol;
  return symbol.getDeclarations().find(Node.isClassDeclaration);
}

function isJestFnCall(node: Node): boolean {
  if (!Node.isCallExpression(node)) return false;
  const expression = node.getExpression();
  return (
    Node.isPropertyAccessExpression(expression) &&
    expression.getExpression().getText() === 'jest' &&
    expression.getName() === 'fn'
  );
}

function containsJestFnCall(node: Node): boolean {
  if (isJestFnCall(node)) return true;
  return node.getDescendantsOfKind(SyntaxKind.CallExpression).some(isJestFnCall);
}

// Strips `as X`/`as unknown as X`/`satisfies X`/parenthesization/`!` wrappers so the underlying
// object literal or call expression is what gets checked for a jest.fn() — e.g.
// `{ insert: jest.fn() } as unknown as jest.Mocked<IOutboxRepository>`.
function unwrapExpression(node: Node): Node {
  if (
    Node.isAsExpression(node) ||
    Node.isTypeAssertion(node) ||
    Node.isSatisfiesExpression(node) ||
    Node.isParenthesizedExpression(node) ||
    Node.isNonNullExpression(node)
  ) {
    return unwrapExpression(node.getExpression());
  }
  return node;
}

// Finds every `<identifier> = <expr>` assignment (anywhere in the same file) whose left side
// resolves back to `declaration` — the `let mock: jest.Mocked<T>; beforeEach(() => { mock = {...}
// })` shape a bare declaration-initializer check misses entirely, since such a `let` has none
// (CodeRabbit/Codex PR #395 review, 2026-08-20: this exact shape left IPushableEventBus in
// pubsub-push.controller.spec.ts and IOutboxRepository in outbox-publisher.spec.ts/
// outbox-relay.service.spec.ts undetected).
function findAssignedExpressions(declaration: Node): Node[] {
  return declaration
    .getSourceFile()
    .getDescendantsOfKind(SyntaxKind.BinaryExpression)
    .filter((binary) => binary.getOperatorToken().getKind() === SyntaxKind.EqualsToken)
    .filter((binary) => {
      const left = binary.getLeft();
      return (
        Node.isIdentifier(left) && (left.getSymbol()?.getDeclarations() ?? []).includes(declaration)
      );
    })
    .map((binary) => binary.getRight());
}

// One-hop interprocedural resolution: a spec helper function taking a repository/port-typed
// parameter and forwarding it straight into `new X(...)` — e.g. `function make(repo: IPort) {
// return new Demo(repo); } make({ find: jest.fn() });` — is a real shape this AC names
// ("constructor argument, parameter, or variable") and the codebase's own `make*` helper
// convention makes plausible, even though no current spec file happens to do it this way yet
// (Codex PR #395 re-review, 2026-08-20). Scoped to the same source file and to a named
// function/const-arrow-function callable by identifier — not a general call-graph walk; a method,
// an IIFE, or a callback never called by name stays out of scope.
function findCallArgumentsForParameter(paramDecl: ParameterDeclaration): Node[] {
  const functionLike = paramDecl.getParent();

  let index = -1;
  let ownerDecl: Node | undefined;
  if (Node.isFunctionDeclaration(functionLike)) {
    index = functionLike.getParameters().indexOf(paramDecl);
    ownerDecl = functionLike;
  } else if (Node.isArrowFunction(functionLike) || Node.isFunctionExpression(functionLike)) {
    index = functionLike.getParameters().indexOf(paramDecl);
    const parent = functionLike.getParent();
    ownerDecl = Node.isVariableDeclaration(parent) ? parent : undefined;
  }
  if (!ownerDecl || index < 0) return [];

  const args: Node[] = [];
  for (const call of paramDecl.getSourceFile().getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    if (!Node.isIdentifier(callee)) continue;
    if (!(callee.getSymbol()?.getDeclarations() ?? []).includes(ownerDecl)) continue;
    const arg = call.getArguments()[index];
    if (arg) args.push(arg);
  }
  return args;
}

// Resolves what a constructor argument "really is" for the purpose of this check — following
// exactly one hop through a local variable or function parameter, so `const mockBus = {...}; new
// Handler(mockBus)`, `let mockBus: jest.Mocked<T>; beforeEach(() => { mockBus = {...}; });
// new Handler(mockBus)`, and `function make(repo: IPort) { new Demo(repo); } make({...jest.fn()})`
// are all treated the same as an inline `new Handler({...})`. Anything else (a
// `new InMemoryXxxRepository()` double, a builder call, `undefined`) resolves to `undefined` and
// is correctly left alone.
function resolveJestMockedArgument(argument: Node): Node | undefined {
  const unwrapped = unwrapExpression(argument);

  if (Node.isObjectLiteralExpression(unwrapped)) {
    return containsJestFnCall(unwrapped) ? unwrapped : undefined;
  }
  if (Node.isCallExpression(unwrapped)) {
    return containsJestFnCall(unwrapped) ? unwrapped : undefined;
  }
  if (Node.isIdentifier(unwrapped)) {
    const declarations = unwrapped.getSymbol()?.getDeclarations() ?? [];
    const variableDecl = declarations.find(Node.isVariableDeclaration);
    const paramDecl = declarations.find(Node.isParameterDeclaration);

    const candidates = variableDecl
      ? [variableDecl.getInitializer(), ...findAssignedExpressions(variableDecl)]
      : paramDecl
        ? [paramDecl.getInitializer(), ...findCallArgumentsForParameter(paramDecl)]
        : [];

    for (const candidate of candidates) {
      if (!candidate) continue;
      const resolved = resolveJestMockedArgument(candidate);
      if (resolved) return resolved;
    }
  }
  return undefined;
}

// Scans every `new X(...)` in a spec file and, for each constructor parameter whose resolved
// type is a repository/port interface (docs/ENGINEERING_RULES.md § InMemory doubles), checks
// whether the corresponding argument is a `jest.fn()`-backed stub instead of an InMemory double.
//
// Scoped to constructor-injection sites deliberately, not every jest.fn()-typed variable in a
// spec file: every repository/port consumer in this codebase is constructor-injected (NestJS DI
// convention, no property injection), so this covers the real population without ever hitting
// the zero-target guard once every current violation is fixed — future specs will keep
// constructing port-typed dependencies forever, they just won't jest.fn() them anymore.
//
// jest.mock()-style module auto-mocking is out of scope: repository/port dependencies are pure
// TS interfaces with no runtime module to auto-mock, so that form cannot target them — confirmed
// empirically (PR #395 review, 2026-08-20): every jest.mock() call in apps/backend/src is against
// a third-party package (undici, nodemailer, @google-cloud/*) or a concrete infra-bootstrapping
// adapter, never a repository/port interface or an adapter injected through one.
export function checkNoJestFnForRepositoryOrPortMocks(project: Project): ScanResult {
  const findings: Finding[] = [];
  let scannedTargets = 0;

  for (const sourceFile of project.getSourceFiles()) {
    if (!sourceFile.getBaseName().endsWith('.spec.ts')) continue;

    for (const newExpression of sourceFile.getDescendantsOfKind(SyntaxKind.NewExpression)) {
      const constructedClass = resolveConstructedClass(newExpression.getExpression());
      const constructor = constructedClass?.getConstructors()[0];
      if (!constructedClass || !constructor) continue;

      const args = newExpression.getArguments();
      const params = constructor.getParameters();
      for (let index = 0; index < params.length; index++) {
        const interfaceName = resolvePortInterfaceName(params[index].getType());
        if (!interfaceName) continue;
        scannedTargets++;

        const argument = args[index];
        if (!argument) continue;
        const mocked = resolveJestMockedArgument(argument);
        if (!mocked) continue;

        findings.push({
          rule: 'no-jest-fn-for-repository-or-port',
          file: sourceFile.getFilePath(),
          line: sourceLine(sourceFile, argument.getStart()),
          message: `${constructedClass.getName()} is constructed with a jest.fn() stub for its ${interfaceName}-typed constructor parameter — use an InMemory${interfaceName.replace(/^I/, '')} double from src/test/infrastructure/ or src/test/repositories/ instead (docs/ENGINEERING_RULES.md § InMemory doubles).`,
        });
      }
    }
  }

  return { rule: 'no-jest-fn-for-repository-or-port', scannedTargets, findings };
}
