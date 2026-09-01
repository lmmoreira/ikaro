import { Node, Project, SourceFile } from 'ts-morph';
import type { Finding, ScanResult } from '../model';
import { sourceLine } from '../project';

export type ClosedEnumMemberKind = 'constArray' | 'union';

export interface ClosedEnumSource {
  path: string;
  kind: ClosedEnumMemberKind;
  exportName: string;
}

// `mirror` must always carry the exact same member set as `canonical` — a strict, bidirectional
// equality check, not a one-directional lag allowance. A registered pair has no legitimate reason
// to diverge in either direction: a new member must land in canonical and every mirror in the same
// change, not across a staged, multi-PR rollout (packages/types/src/enums.ts's HotsiteModuleType
// historically lagged behind during LEAD_FORM's rollout, M20-S01 -> M20-S07 — this registry closes
// that exact gap going forward, it doesn't codify it as permitted).
export interface ClosedEnumRegistryEntry {
  name: string;
  canonical: ClosedEnumSource;
  mirror: ClosedEnumSource;
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
// directly on the VariableDeclaration's initializer. The `as const` itself is required, not
// optional: without it, TypeScript widens the array to `string[]`, and the exported
// `(typeof X)[number]` type collapses to plain `string` — no longer a closed enum at all, even
// though today's concrete values still happen to be string literals. `as SomeOtherType` (a
// non-const assertion) is rejected the same way. Every element must also be a string literal — a
// non-literal element (a variable reference, a numeric/boolean literal) makes the array's real
// member set unknowable. Any of these makes the declaration unresolved rather than silently
// filtering/accepting the offending shape (Codex + CodeRabbit, PR #456 round 1 + round 5: silent
// filtering/acceptance let a malformed/widened declaration pass the registry's closed-enum
// guarantee with zero findings).
function constArrayMembers(
  sourceFile: SourceFile,
  exportName: string,
): { members: Set<string>; node: Node } | undefined {
  const declaration = sourceFile.getVariableDeclaration(exportName);
  if (!declaration) return undefined;
  const initializer = declaration.getInitializer();
  if (!initializer || !Node.isAsExpression(initializer)) return undefined;
  const typeNode = initializer.getTypeNode();
  if (!typeNode || typeNode.getText() !== 'const') return undefined;

  const arrayLiteral = initializer.getExpression();
  if (!Node.isArrayLiteralExpression(arrayLiteral)) return undefined;

  const elements = arrayLiteral.getElements();
  const stringLiterals = elements.filter(Node.isStringLiteral);
  if (stringLiterals.length !== elements.length) return undefined;

  const members = stringLiterals.map((element) => element.getLiteralValue());
  return { members: new Set(members), node: declaration };
}

// Same closed-only stance as constArrayMembers above: a union member that isn't itself a string
// literal (a widening type like `string`, a numeric/boolean literal, a type reference) makes the
// type's real member set unknowable — treated as unresolved, not silently dropped.
function unionMembers(
  sourceFile: SourceFile,
  exportName: string,
): { members: Set<string>; node: Node } | undefined {
  const declaration = sourceFile.getTypeAlias(exportName);
  if (!declaration) return undefined;
  const typeNode = declaration.getTypeNode();
  if (!typeNode) return undefined;

  const typeNodes = Node.isUnionTypeNode(typeNode) ? typeNode.getTypeNodes() : [typeNode];
  const literalTypeNodes = typeNodes.filter(Node.isLiteralTypeNode);
  if (literalTypeNodes.length !== typeNodes.length) return undefined;

  const literals = literalTypeNodes.map((literalTypeNode) => literalTypeNode.getLiteral());
  const stringLiterals = literals.filter(Node.isStringLiteral);
  if (stringLiterals.length !== literals.length) return undefined;

  const members = stringLiterals.map((literal) => literal.getLiteralValue());
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
  side: 'canonical' | 'mirror',
  source: ClosedEnumSource,
): Finding {
  return {
    rule: 'closed-enum-registry',
    file: source.path,
    line: 1,
    message: `architecture-policy.json's closedEnumRegistry entry "${entryName}" names a ${side} source (${source.path}#${source.exportName}) that could not be resolved as a ${source.kind === 'constArray' ? "'as const' array literal" : 'string-literal union'}.`,
  };
}

// Strict bidirectional equality, not a one-directional lag allowance: a member present on either
// side but not the other is a finding, regardless of direction. Mechanically distinct from
// aggregate-primitive-vo's aggregateValueObjectRegistry (aggregate-prop-vs-VO typing) and
// ikaro-types-drift (structural interface/type-alias field-shape diffing) — this detector extracts
// and diffs literal string-member sets from a `constArray`/`union` declaration pair instead.
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

    const mirror = resolveMembers(projects, entry.mirror);
    if (!mirror) {
      findings.push(unresolvedFinding(entry.name, 'mirror', entry.mirror));
      continue;
    }

    const extraInMirror = [...mirror.members]
      .filter((member) => !canonical.members.has(member))
      .sort();
    const missingFromMirror = [...canonical.members]
      .filter((member) => !mirror.members.has(member))
      .sort();
    if (extraInMirror.length === 0 && missingFromMirror.length === 0) continue;

    const descriptions: string[] = [];
    if (extraInMirror.length > 0) {
      descriptions.push(
        `has member(s) [${extraInMirror.join(', ')}] not present in canonical (${entry.canonical.path}'s "${entry.canonical.exportName}")`,
      );
    }
    if (missingFromMirror.length > 0) {
      descriptions.push(
        `is missing member(s) [${missingFromMirror.join(', ')}] present in canonical (${entry.canonical.path}'s "${entry.canonical.exportName}")`,
      );
    }

    findings.push({
      rule: 'closed-enum-registry',
      file: mirror.file.getFilePath(),
      line: sourceLine(mirror.file, mirror.node.getStart()),
      message: `"${entry.name}" (${entry.mirror.path}) ${descriptions.join('; and ')} — every registered mirror must match its canonical source exactly.`,
    });
  }

  return { rule: 'closed-enum-registry', scannedTargets, findings };
}
