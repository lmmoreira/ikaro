import {
  InterfaceDeclaration,
  Node,
  Project,
  PropertySignature,
  Symbol as TsMorphSymbol,
  Type,
  TypeAliasDeclaration,
} from 'ts-morph';
import type { Finding, ScanResult } from '../model';
import { sourceLine } from '../project';

export interface IkaroTypesDriftException {
  path: string;
  name: string;
}

interface FieldSignature {
  base: string;
  mayBeAbsent: boolean;
  mayBeNull: boolean;
}

// Web transport-boundary modules only (CLAUDE.md's own documented anti-pattern location list):
// feature api directories/files and shared API modules. Deliberately excludes component prop
// types, page/layout files, and anything under apps/web/app/** — those aren't the wire contract.
const WEB_TRANSPORT_FILE_PATTERNS: RegExp[] = [
  /\/apps\/web\/features\/[^/]+\/api\/.+\.ts$/,
  /\/apps\/web\/features\/[^/]+\/api\.server\.ts$/,
  /\/apps\/web\/features\/[^/]+\/api\.ts$/,
  /\/apps\/web\/shared\/lib\/api\/.+\.ts$/,
  /\/apps\/web\/shared\/types\/.+\.ts$/,
];

const MAX_WALK_DEPTH = 8;

function isWebTransportFile(filePath: string): boolean {
  return (
    WEB_TRANSPORT_FILE_PATTERNS.some((pattern) => pattern.test(filePath)) &&
    !filePath.endsWith('.spec.ts')
  );
}

function isExempt(filePath: string, name: string, exceptions: IkaroTypesDriftException[]): boolean {
  return exceptions.some(
    (exception) => exception.name === name && filePath.endsWith(exception.path),
  );
}

function nonNullishConstituents(type: Type): Type[] {
  const constituents = type.isUnion() ? type.getUnionTypes() : [type];
  return constituents.filter((constituent) => !constituent.isNull() && !constituent.isUndefined());
}

function includesNull(type: Type): boolean {
  const constituents = type.isUnion() ? type.getUnionTypes() : [type];
  return constituents.some((constituent) => constituent.isNull());
}

function includesUndefined(type: Type): boolean {
  const constituents = type.isUnion() ? type.getUnionTypes() : [type];
  return constituents.some((constituent) => constituent.isUndefined());
}

function isClassType(type: Type): boolean {
  return Boolean(type.getSymbol()?.getDeclarations().some(Node.isClassDeclaration));
}

// An object shape worth recursing into structurally (a plain interface/type-literal/array
// element), not a class/VO instance — mirrors aggregate-primitive-vo.ts's identical distinction:
// a class-typed field is treated as an opaque leaf (compared by name only), never walked.
function isRecursablePlainShape(type: Type): boolean {
  return type.isObject() && !type.isArray() && !isClassType(type);
}

function propertyDeclaration(symbol: TsMorphSymbol): PropertySignature | undefined {
  return symbol.getDeclarations().find(Node.isPropertySignature);
}

// Two independent ts-morph Projects (web, @ikaro/types) never share a single TypeChecker, so
// there is no cross-project Type.isAssignableTo to lean on. Instead each side's shape is reduced
// independently to the same normalized textual signature, and the two signatures are diffed as
// plain strings/booleans. import("/abs/path").Foo noise (which differs by project root and would
// otherwise make every nested named-type reference look like a mismatch) is stripped before
// comparing — this is a name-based comparison for nested types, consistent with the detector's
// own top-level rule ("An identical duplicate name is also a finding... differently named
// semantic duplicates remain review territory").
function stripImportPaths(text: string): string {
  return text.replace(/import\([^)]*\)\./g, '').trim();
}

function baseTypeSignature(type: Type, depth: number, seen: ReadonlySet<unknown>): string {
  if (depth > MAX_WALK_DEPTH) return '<max-depth>';
  if (type.isArray()) {
    const element = type.getArrayElementType();
    return element ? `Array<${unionSignature(element, depth + 1, seen)}>` : 'Array<unknown>';
  }
  if (isRecursablePlainShape(type)) {
    const identity: unknown = type.getSymbol() ?? type;
    if (seen.has(identity)) return '<cycle>';
    return objectSignature(type, depth, new Set([...seen, identity]));
  }
  return stripImportPaths(type.getText());
}

function unionSignature(type: Type, depth: number, seen: ReadonlySet<unknown>): string {
  const constituents = nonNullishConstituents(type);
  if (constituents.length === 0) return 'never';
  return constituents
    .map((constituent) => baseTypeSignature(constituent, depth, seen))
    .sort()
    .join(' | ');
}

function objectSignature(type: Type, depth: number, seen: ReadonlySet<unknown>): string {
  const entries = type
    .getProperties()
    .map((symbol) => {
      const declaration = propertyDeclaration(symbol);
      if (!declaration) return undefined;
      const propertyType = declaration.getType();
      const mayBeAbsent = declaration.hasQuestionToken() || includesUndefined(propertyType);
      const mayBeNull = includesNull(propertyType);
      const base = unionSignature(propertyType, depth + 1, seen);
      return `${symbol.getName()}${mayBeAbsent ? '?' : ''}: ${base}${mayBeNull ? ' | null' : ''}`;
    })
    .filter((entry): entry is string => entry !== undefined)
    .sort();
  return `{ ${entries.join('; ')} }`;
}

function fieldSignatures(type: Type): Map<string, FieldSignature> {
  const map = new Map<string, FieldSignature>();
  for (const symbol of type.getProperties()) {
    const declaration = propertyDeclaration(symbol);
    if (!declaration) continue;
    const propertyType = declaration.getType();
    map.set(symbol.getName(), {
      base: unionSignature(propertyType, 1, new Set()),
      mayBeAbsent: declaration.hasQuestionToken() || includesUndefined(propertyType),
      mayBeNull: includesNull(propertyType),
    });
  }
  return map;
}

function describeAbsence(field: FieldSignature): string {
  const modifiers = [
    field.mayBeAbsent ? 'optional/undefined' : undefined,
    field.mayBeNull ? 'nullable' : undefined,
  ].filter((modifier): modifier is string => Boolean(modifier));
  return modifiers.length > 0 ? modifiers.join('+') : 'required, non-null';
}

// Compares both directions at once: a field present on exactly one side is caught by iterating
// the union of both key sets, not just one side's keys.
function compareShapes(webType: Type, typesType: Type): string[] {
  const webFields = fieldSignatures(webType);
  const typesFields = fieldSignatures(typesType);
  const messages: string[] = [];

  for (const name of new Set([...webFields.keys(), ...typesFields.keys()])) {
    const webField = webFields.get(name);
    const typesField = typesFields.get(name);

    if (!webField) {
      messages.push(`missing field "${name}" (present in @ikaro/types)`);
      continue;
    }
    if (!typesField) {
      messages.push(`extra field "${name}" (not present in @ikaro/types)`);
      continue;
    }
    if (webField.base !== typesField.base) {
      messages.push(
        `field "${name}" type mismatch: web has "${webField.base}", @ikaro/types has "${typesField.base}"`,
      );
      continue;
    }
    // Nullability/optionality is compared as its own drift category, same severity as a type-text
    // mismatch: a value that can genuinely be null/absent over JSON but is typed non-nullable on
    // one side is a real runtime risk, not a cosmetic variance (TD37-S11 story-discovery, 2026-08-22).
    if (
      webField.mayBeAbsent !== typesField.mayBeAbsent ||
      webField.mayBeNull !== typesField.mayBeNull
    ) {
      messages.push(
        `field "${name}" nullability mismatch: web is ${describeAbsence(webField)}, @ikaro/types is ${describeAbsence(typesField)}`,
      );
    }
  }

  return messages;
}

function typesExportMap(
  typesProject: Project,
): Map<string, InterfaceDeclaration | TypeAliasDeclaration> {
  const indexFile = typesProject
    .getSourceFiles()
    .find((sourceFile) => sourceFile.getFilePath().endsWith('/packages/types/src/index.ts'));
  if (!indexFile) {
    throw new Error(
      'checkIkaroTypesDrift: packages/types/src/index.ts was not found in the provided @ikaro/types project.',
    );
  }

  // The root-barrel EXPORT SURFACE only (what `import { X } from '@ikaro/types'` actually
  // resolves to), not every declaration in packages/types/src/**. getExportedDeclarations()
  // follows every `export *` re-export chain in index.ts, so a name only reachable via a
  // subpath (packages/types/src/protocol/**, media.ts — neither re-exported from index.ts
  // today) is correctly excluded (TD37-S11 story-discovery, 2026-08-22).
  const exportMap = new Map<string, InterfaceDeclaration | TypeAliasDeclaration>();
  for (const [name, declarations] of indexFile.getExportedDeclarations()) {
    const declaration = declarations.find(
      (candidate): candidate is InterfaceDeclaration | TypeAliasDeclaration =>
        Node.isInterfaceDeclaration(candidate) || Node.isTypeAliasDeclaration(candidate),
    );
    if (declaration) exportMap.set(name, declaration);
  }
  return exportMap;
}

// Full-codebase, non-diff-scoped counterpart to scripts/pre-pr.sh's WEB-7 (name-collision-only,
// diff-scoped) and bad-smell-audit's WEB-9 (LLM-driven, opt-in) checks. Catches exactly the
// LoyaltyEntryItem/LoyaltyRedemptionItem class of drift on every PR, regardless of which files
// that PR touches (TD37-S11).
export function checkIkaroTypesDrift(
  webProject: Project,
  typesProject: Project,
  exceptions: IkaroTypesDriftException[] = [],
): ScanResult {
  const findings: Finding[] = [];
  let scannedTargets = 0;
  const typesExports = typesExportMap(typesProject);

  for (const sourceFile of webProject.getSourceFiles()) {
    const filePath = sourceFile.getFilePath();
    if (!isWebTransportFile(filePath)) continue;
    scannedTargets++;

    const declarations: Array<InterfaceDeclaration | TypeAliasDeclaration> = [
      ...sourceFile.getInterfaces(),
      ...sourceFile.getTypeAliases(),
    ];

    for (const declaration of declarations) {
      if (!declaration.isExported()) continue;
      const name = declaration.getName();
      const typesDeclaration = typesExports.get(name);
      if (!typesDeclaration) continue;
      if (isExempt(filePath, name, exceptions)) continue;

      const mismatches = compareShapes(declaration.getType(), typesDeclaration.getType());
      const line = sourceLine(sourceFile, declaration.getStart());

      if (mismatches.length === 0) {
        findings.push({
          rule: 'ikaro-types-drift',
          file: filePath,
          line,
          message: `"${name}" is structurally identical to @ikaro/types' "${name}" (packages/types/src/index.ts) — import it from "@ikaro/types" instead of redeclaring it here.`,
        });
        continue;
      }

      findings.push({
        rule: 'ikaro-types-drift',
        file: filePath,
        line,
        message: `"${name}" has drifted from @ikaro/types' "${name}" (packages/types/src/index.ts): ${mismatches.join('; ')}.`,
      });
    }
  }

  return { rule: 'ikaro-types-drift', scannedTargets, findings };
}
