import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

/**
 * Mirrors `GcpPubSubEventBusAdapter`'s naming exactly: one entry per
 * `ikaro-{event}` topic, one push subscription per consumer
 * (`ikaro-{event}-{consumer}`). Covers both domain-event `subscribe()` call
 * sites and cron `registerTrigger()` call sites uniformly — Terraform
 * provisions the same topic/subscription/DLQ triple for either.
 */
export interface PubSubCatalogEntry {
  readonly event: string;
  readonly consumers: readonly string[];
}

const BUS_METHODS = new Set(['subscribe', 'registerTrigger']);

interface Registration {
  readonly topic: string;
  readonly consumer: string;
}

/**
 * Literal string values collected from every scanned file, used to resolve
 * call-site arguments that aren't string literals themselves — same
 * "scan for a known, controlled source shape" approach as
 * `terraform-env-keys.ts`, not a full TS `Program`/checker: real call sites
 * only ever pass (a) a string literal, (b) `ClassName.name` (resolved
 * directly from the property access, see `resolveArg`), (c) a same-file or
 * cross-file top-level `export const NAME = '...'`, or (d) a same-file or
 * cross-file `static readonly PROP = '...'` class member.
 */
interface StringConstants {
  /** `export const NAME = '...'`, keyed by bare name. */
  readonly topLevel: ReadonlyMap<string, string>;
  /** `static readonly PROP = '...'` inside `class ClassName`, keyed by `"ClassName.PROP"`. */
  readonly staticProps: ReadonlyMap<string, string>;
}

export function buildPubSubCatalog(sources: ReadonlyMap<string, string>): PubSubCatalogEntry[] {
  const constants = collectStringConstants(sources);
  const registrations: Registration[] = [];

  for (const [fileName, sourceText] of sources) {
    const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);
    collectRegistrations(sourceFile, constants, registrations);
  }

  return groupByTopic(registrations);
}

function collectStringConstants(sources: ReadonlyMap<string, string>): StringConstants {
  const topLevel = new Map<string, string>();
  const staticProps = new Map<string, string>();

  for (const [fileName, sourceText] of sources) {
    const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);

    const visit = (node: ts.Node): void => {
      if (ts.isVariableStatement(node) && isExported(node)) {
        for (const decl of node.declarationList.declarations) {
          if (
            ts.isIdentifier(decl.name) &&
            decl.initializer &&
            ts.isStringLiteralLike(decl.initializer)
          ) {
            setUnique(topLevel, decl.name.text, decl.initializer.text, fileName);
          }
        }
      }

      if (ts.isClassDeclaration(node) && node.name) {
        const className = node.name.text;
        for (const member of node.members) {
          if (
            ts.isPropertyDeclaration(member) &&
            ts.isIdentifier(member.name) &&
            member.initializer &&
            ts.isStringLiteralLike(member.initializer)
          ) {
            setUnique(
              staticProps,
              `${className}.${member.name.text}`,
              member.initializer.text,
              fileName,
            );
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  return { topLevel, staticProps };
}

function isExported(node: ts.VariableStatement): boolean {
  return (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

function setUnique(map: Map<string, string>, key: string, value: string, fileName: string): void {
  const existing = map.get(key);
  if (existing !== undefined && existing !== value) {
    throw new Error(
      `pubsub-catalog: conflicting values for "${key}" — "${existing}" vs "${value}" ` +
        `(found while scanning ${fileName})`,
    );
  }
  map.set(key, value);
}

function collectRegistrations(
  sourceFile: ts.SourceFile,
  constants: StringConstants,
  out: Registration[],
): void {
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      BUS_METHODS.has(node.expression.name.text) &&
      node.arguments.length >= 3
    ) {
      out.push({
        topic: resolveArg(node.arguments[0], constants, sourceFile),
        consumer: resolveArg(node.arguments[2], constants, sourceFile),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

/**
 * Resolves a `subscribe()`/`registerTrigger()` call-site argument to its
 * literal string value. Throws rather than guessing on an unrecognized
 * shape — a scanner that silently misresolves a registration is worse than
 * one that fails loudly (this is the exact failure mode the catalog/CI
 * no-diff check exists to prevent).
 */
function resolveArg(
  node: ts.Expression,
  constants: StringConstants,
  sourceFile: ts.SourceFile,
): string {
  if (ts.isStringLiteralLike(node)) {
    return node.text;
  }

  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
    // `ClassName.name` is the class's own declared name at runtime — no
    // lookup needed, and note this is NOT necessarily the same string as a
    // generic type argument on the call (see dead-letter.handler.ts, which
    // passes a `'dead-letter'` literal alongside `subscribe<Envelope>`).
    if (node.name.text === 'name') {
      return node.expression.text;
    }

    const qualified = `${node.expression.text}.${node.name.text}`;
    const staticValue = constants.staticProps.get(qualified);
    if (staticValue !== undefined) {
      return staticValue;
    }
  }

  if (ts.isIdentifier(node)) {
    const topLevelValue = constants.topLevel.get(node.text);
    if (topLevelValue !== undefined) {
      return topLevelValue;
    }
  }

  throw new Error(
    `pubsub-catalog: cannot resolve a literal string value for "${node.getText(sourceFile)}" in ` +
      `${sourceFile.fileName} — extend resolveArg to handle this expression shape.`,
  );
}

function groupByTopic(registrations: readonly Registration[]): PubSubCatalogEntry[] {
  const byTopic = new Map<string, Set<string>>();
  for (const { topic, consumer } of registrations) {
    const consumers = byTopic.get(topic) ?? new Set<string>();
    consumers.add(consumer);
    byTopic.set(topic, consumers);
  }

  return [...byTopic.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([event, consumers]) => ({ event, consumers: [...consumers].sort() }));
}

const BACKEND_SRC_DIR = 'apps/backend/src';
const CATALOG_OUTPUT_PATH = 'infra/terraform/pubsub-catalog.json';

function collectBackendSources(rootDir: string): Map<string, string> {
  const sources = new Map<string, string>();

  const walk = (dir: string): void => {
    const entries = fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
        sources.set(fullPath, fs.readFileSync(fullPath, 'utf8'));
      }
    }
  };

  walk(rootDir);
  return sources;
}

export function generateCatalogFile(repoRoot: string): PubSubCatalogEntry[] {
  const sources = collectBackendSources(path.join(repoRoot, BACKEND_SRC_DIR));
  const catalog = buildPubSubCatalog(sources);
  fs.writeFileSync(
    path.join(repoRoot, CATALOG_OUTPUT_PATH),
    `${JSON.stringify(catalog, null, 2)}\n`,
    'utf8',
  );
  return catalog;
}

function main(): void {
  const repoRoot = path.resolve(__dirname, '../../..');
  const catalog = generateCatalogFile(repoRoot);
  const subscriptionCount = catalog.reduce((sum, entry) => sum + entry.consumers.length, 0);
  console.log(
    `pubsub-catalog: wrote ${catalog.length} topic(s) / ${subscriptionCount} subscription(s) to ${CATALOG_OUTPUT_PATH}`,
  );
}

if (require.main === module) {
  main();
}
