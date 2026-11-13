import { Decorator, Node, Project, SourceFile } from 'ts-morph';
import type { DetectorMode, Finding, ScanResult } from '../model';
import { sourceLine } from '../project';

export const TENANT_ACCESS_ROUTE_RULE = 'tenant-access-route-metadata';

/**
 * Which decorators count as a route's tenant-access declaration (UC-125). Read from the policy
 * file, never hardcoded here, so a future gating decorator (or a repo-defined composite built with
 * `applyDecorators`) is one policy entry and no change to the detector.
 */
export interface TenantAccessRoutePolicy {
  mode: DetectorMode;
  /** `@RequiresFeature` or `@NoFeatureGate`: the route's entitlement declaration. */
  entitlementDecorators: string[];
  /** `@SuspensionAccess`: the route's explicit suspended-state policy (`DEFAULT_DENY` is the explicit default). */
  suspensionDecorators: string[];
}

const HTTP_ROUTE_DECORATORS = new Set([
  'Get',
  'Post',
  'Put',
  'Patch',
  'Delete',
  'All',
  'Head',
  'Options',
]);
const CONTROLLER_FILE = /\.controller\.ts$/;

/**
 * Every tenant-scoped route must declare its entitlement (`@RequiresFeature(...)` or
 * `@NoFeatureGate()`) and its suspension policy (`@SuspensionAccess(...)`), on the handler or on its
 * controller class. A route with neither still works (it defaults to entitlement-allowed,
 * suspension-denied), but the default must be a deliberate, visible choice.
 *
 * The detector recognises the declaration however it is written, so a rewrite cannot slip past it:
 * - an aliased import (`import { RequiresFeature as Gate }`),
 * - a namespaced or computed-literal reference (`gates.RequiresFeature(...)`, `gates['RequiresFeature'](...)`),
 * - a bare decorator reference without a call, and
 * - a declaration nested inside `applyDecorators(...)`.
 *
 * Every `*.controller.ts` of the projects it is given is scanned, with no folder exemptions (health,
 * cron and Pub/Sub controllers declare `@NoFeatureGate()` like any other). `scannedTargets` counts
 * the routes examined.
 */
export function checkTenantAccessRouteMetadata(
  projects: Project[],
  policy: TenantAccessRoutePolicy,
): ScanResult {
  const entitlement = new Set(policy.entitlementDecorators);
  const suspension = new Set(policy.suspensionDecorators);
  const findings: Finding[] = [];
  let scannedTargets = 0;

  for (const project of projects) {
    for (const sourceFile of project.getSourceFiles()) {
      if (!CONTROLLER_FILE.test(sourceFile.getFilePath())) continue;
      const aliases = importAliases(sourceFile);

      for (const controller of sourceFile.getClasses()) {
        const classNames = declaredNames(controller.getDecorators(), aliases);
        if (!classNames.has('Controller')) continue;

        for (const method of controller.getMethods()) {
          const methodDecorators = method.getDecorators();
          const methodNames = declaredNames(methodDecorators, aliases);
          if (![...methodNames].some((name) => HTTP_ROUTE_DECORATORS.has(name))) continue;
          scannedTargets++;

          const declared = new Set([...classNames, ...methodNames]);
          const missing: string[] = [];
          if (![...entitlement].some((name) => declared.has(name))) {
            missing.push(
              `entitlement declaration (${[...entitlement].map((n) => `@${n}`).join(' or ')})`,
            );
          }
          if (![...suspension].some((name) => declared.has(name))) {
            missing.push(`suspension policy (${[...suspension].map((n) => `@${n}`).join(' or ')})`);
          }
          if (missing.length === 0) continue;

          findings.push({
            rule: TENANT_ACCESS_ROUTE_RULE,
            file: sourceFile.getFilePath(),
            line: sourceLine(sourceFile, method.getStart()),
            message: `${controller.getName() ?? 'controller'}.${method.getName()} has no ${missing.join(' and no ')}. Declare it on the handler or its controller (docs/ENGINEERING_RULES_SHARED.md § Tenant access enforcement); the unannotated default is entitlement-allowed, suspension-denied.`,
          });
        }
      }
    }
  }

  return { rule: TENANT_ACCESS_ROUTE_RULE, scannedTargets, findings };
}

// `import { A as B }` → B resolves to A, so an alias cannot hide a declaration.
function importAliases(sourceFile: SourceFile): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const declaration of sourceFile.getImportDeclarations()) {
    for (const specifier of declaration.getNamedImports()) {
      const alias = specifier.getAliasNode()?.getText();
      if (alias) aliases.set(alias, specifier.getName());
    }
  }
  return aliases;
}

function declaredNames(decorators: Decorator[], aliases: Map<string, string>): Set<string> {
  const names = new Set<string>();
  for (const decorator of decorators) collectNames(decorator.getExpression(), aliases, names);
  return names;
}

function collectNames(node: Node, aliases: Map<string, string>, out: Set<string>): void {
  if (Node.isCallExpression(node)) {
    const name = referenceName(node.getExpression(), aliases);
    if (name === 'applyDecorators') {
      for (const argument of node.getArguments()) collectNames(argument, aliases, out);
    } else if (name) {
      out.add(name);
    }
    return;
  }
  const name = referenceName(node, aliases);
  if (name) out.add(name);
}

function referenceName(node: Node, aliases: Map<string, string>): string | undefined {
  if (Node.isIdentifier(node)) return aliases.get(node.getText()) ?? node.getText();
  if (Node.isPropertyAccessExpression(node)) return node.getName();
  if (Node.isElementAccessExpression(node)) {
    const argument = node.getArgumentExpression();
    if (argument && Node.isStringLiteral(argument)) return argument.getLiteralText();
    if (argument && Node.isNoSubstitutionTemplateLiteral(argument))
      return argument.getLiteralText();
  }
  return undefined;
}
