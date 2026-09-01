import { Node, Project, SourceFile } from 'ts-morph';
import type { Finding, ScanResult } from '../model';
import { sourceLine } from '../project';

export type ClosedEnumMemberKind = 'constArray' | 'union';

export interface ClosedEnumSource {
  path: string;
  kind: ClosedEnumMemberKind;
  exportName: string;
}

// `mayLeadAhead` names the copy `canonical` is allowed to lead ahead of (TD37-S21) — i.e. the
// registered copy that may legitimately LAG BEHIND canonical (e.g. during a staged module-type
// rollout), never the reverse. The field is named after the historical incident it guards against
// (packages/types/src/enums.ts's HotsiteModuleType led ahead of the backend/validation copies
// during M20-S01), not after what it's currently permitted to do.
export interface ClosedEnumRegistryEntry {
  name: string;
  canonical: ClosedEnumSource;
  mayLeadAhead: ClosedEnumSource;
}

interface ResolvedMembers {
  members: ReadonlySet<string>;
  file: SourceFile;
  node: Node;
}

function findSourceFile(projects: Project[], path: string): SourceFile | undefined {
  for (const project of projects) {
    const match = project.getSourceFiles().find((file) => file.getFilePath().endsWith(`/${path}`));
    if (match) return match;
  }
  return undefined;
}

// `HOTSITE_MODULE_TYPES = [...] as const` — the array literal sits inside an AsExpression, not
// directly on the VariableDeclaration's initializer.
function constArrayMembers(
  sourceFile: SourceFile,
  exportName: string,
): { members: Set<string>; node: Node } | undefined {
  const declaration = sourceFile.getVariableDeclaration(exportName);
  if (!declaration) return undefined;
  const rawInitializer = declaration.getInitializer();
  const initializer =
    rawInitializer && Node.isAsExpression(rawInitializer)
      ? rawInitializer.getExpression()
      : rawInitializer;
  if (!initializer || !Node.isArrayLiteralExpression(initializer)) return undefined;

  const members = initializer
    .getElements()
    .filter(Node.isStringLiteral)
    .map((element) => element.getLiteralValue());
  return { members: new Set(members), node: declaration };
}

function unionMembers(
  sourceFile: SourceFile,
  exportName: string,
): { members: Set<string>; node: Node } | undefined {
  const declaration = sourceFile.getTypeAlias(exportName);
  if (!declaration) return undefined;
  const typeNode = declaration.getTypeNode();
  if (!typeNode) return undefined;

  const literalTypeNodes = Node.isUnionTypeNode(typeNode) ? typeNode.getTypeNodes() : [typeNode];
  const members = literalTypeNodes
    .filter(Node.isLiteralTypeNode)
    .map((literalTypeNode) => literalTypeNode.getLiteral())
    .filter(Node.isStringLiteral)
    .map((literal) => literal.getLiteralValue());
  return { members: new Set(members), node: declaration };
}

function resolveMembers(
  projects: Project[],
  source: ClosedEnumSource,
): ResolvedMembers | undefined {
  const file = findSourceFile(projects, source.path);
  if (!file) return undefined;
  const result =
    source.kind === 'constArray'
      ? constArrayMembers(file, source.exportName)
      : unionMembers(file, source.exportName);
  return result ? { members: result.members, node: result.node, file } : undefined;
}

function unresolvedFinding(
  entryName: string,
  side: 'canonical' | 'mayLeadAhead',
  source: ClosedEnumSource,
): Finding {
  return {
    rule: 'closed-enum-registry',
    file: source.path,
    line: 1,
    message: `architecture-policy.json's closedEnumRegistry entry "${entryName}" names a ${side} source (${source.path}#${source.exportName}) that could not be resolved as a ${source.kind === 'constArray' ? "'as const' array literal" : 'string-literal union'}.`,
  };
}

// Superset-only, not equality: every member of `mayLeadAhead` must already exist in `canonical` —
// a web/downstream copy gaining a member the canonical source doesn't know about is a real drift
// bug. The reverse (canonical having a member `mayLeadAhead` lacks) is allowed and produces no
// finding — that's exactly what a staged rollout looks like mid-flight. This is deliberately not
// the same shape as aggregate-primitive-vo's aggregateValueObjectRegistry or ikaro-types-drift
// (both check pure duplication/mismatch in both directions); here one direction is permanently
// allowed by design.
export function checkClosedEnumRegistry(
  projects: Project[],
  registry: ClosedEnumRegistryEntry[],
): ScanResult {
  const findings: Finding[] = [];
  let scannedTargets = 0;

  for (const entry of registry) {
    scannedTargets++;

    const canonical = resolveMembers(projects, entry.canonical);
    if (!canonical) {
      findings.push(unresolvedFinding(entry.name, 'canonical', entry.canonical));
      continue;
    }

    const mayLeadAhead = resolveMembers(projects, entry.mayLeadAhead);
    if (!mayLeadAhead) {
      findings.push(unresolvedFinding(entry.name, 'mayLeadAhead', entry.mayLeadAhead));
      continue;
    }

    const extraMembers = [...mayLeadAhead.members]
      .filter((member) => !canonical.members.has(member))
      .sort();
    if (extraMembers.length === 0) continue;

    findings.push({
      rule: 'closed-enum-registry',
      file: mayLeadAhead.file.getFilePath(),
      line: sourceLine(mayLeadAhead.file, mayLeadAhead.node.getStart()),
      message: `"${entry.name}" (${entry.mayLeadAhead.path}) has member(s) [${extraMembers.join(', ')}] not present in its canonical source (${entry.canonical.path}'s "${entry.canonical.exportName}") — a registered copy may lag behind its canonical source but must never lead ahead of it.`,
    });
  }

  return { rule: 'closed-enum-registry', scannedTargets, findings };
}
