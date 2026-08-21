import {
  Node,
  Project,
  PropertySignature,
  Symbol as TsMorphSymbol,
  SyntaxKind,
  Type,
} from 'ts-morph';
import type { Finding, ScanResult } from '../model';
import { sourceLine } from '../project';

// Closed, reviewed registry — TD37-S09 (bad-smell-audit BE-1). Each entry names the one shared
// VO a property concept must resolve to. `exactNames` covers a bare field name; `suffixes`
// covers a camelCase-compound name ending in the concept (e.g. "contactEmail", "managerEmail").
// Deliberately does NOT cover every VO in docs/VALUE_OBJECTS_REFERENCE.md: `title`/`description`
// (SeoTitle/SeoDescription) are too generic to register safely — Service.description and
// NotificationTemplate.subject/body are legitimately plain text under the exact same names, and
// a global match would false-positive on them. Money/TimeOfDay/Timezone are enumerated exact
// names, not suffixes: a "*Time"/"*Amount" suffix risks matching an unrelated timestamp/count
// field that was never meant to be TimeOfDay/Money.
export interface AggregateValueObjectConcept {
  requiredType: string;
  voFile: string;
  exactNames: string[];
  suffixes: string[];
}

export interface AggregatePrimitiveVoExemption {
  path: string;
  property: string;
}

const AGGREGATE_FILE = /\/domain\/[^/]+\.aggregate\.ts$/;
const MAX_WALK_DEPTH = 8;

function matchesConcept(propertyName: string, concept: AggregateValueObjectConcept): boolean {
  return (
    concept.exactNames.includes(propertyName) ||
    concept.suffixes.some((suffix) => propertyName.endsWith(suffix))
  );
}

function findConcept(
  propertyName: string,
  registry: AggregateValueObjectConcept[],
): AggregateValueObjectConcept | undefined {
  return registry.find((concept) => matchesConcept(propertyName, concept));
}

function nonNullishConstituents(type: Type): Type[] {
  const constituents = type.isUnion() ? type.getUnionTypes() : [type];
  return constituents.filter((constituent) => !constituent.isNull() && !constituent.isUndefined());
}

function isPlainPrimitive(type: Type): boolean {
  return type.isString() || type.isNumber() || type.isStringLiteral() || type.isNumberLiteral();
}

function isClassType(type: Type): boolean {
  return Boolean(type.getSymbol()?.getDeclarations().some(Node.isClassDeclaration));
}

// A recursable plain data shape: an object type (interface, inline type literal, or an
// interface inherited via `extends` — the resolved Type's own `getProperties()` already
// flattens inheritance, so no separate inherited-member handling is needed) that is NOT a
// class/VO. Arrays are object types too but are never a nested Props shape in this codebase.
function isRecursablePlainShape(type: Type): boolean {
  return type.isObject() && !type.isArray() && !isClassType(type);
}

function propertyDeclaration(symbol: TsMorphSymbol): PropertySignature | undefined {
  return symbol.getDeclarations().find(Node.isPropertySignature);
}

// Aggregate props typed as primitive when a VO exists (bad-smell-audit BE-1, TD37-S09).
// Resolves each aggregate class's own `props: XxxProps` field and walks its resolved TYPE
// (not the AST interface declaration) — this covers a plain nested interface, an inline object
// literal shape, and a property inherited via `interface Xxx extends Common` uniformly, since
// TypeScript's own structural type system already flattens all three into the same resolved
// property list. Recursion stops the moment a property resolves to a class/VO type: a
// class-typed field already encapsulates its own internals per Option A ("aggregate props
// interfaces use VO types") — that VO's own private representation (e.g. TenantSettings'
// internal TenantSettingsData, validated by its own Validator classes) is that VO's concern,
// not a flat property of the aggregate this check enforces.
export function checkAggregatePropsUseSharedValueObjects(
  project: Project,
  registry: AggregateValueObjectConcept[],
  exemptions: AggregatePrimitiveVoExemption[] = [],
): ScanResult {
  const findings: Finding[] = [];
  let scannedTargets = 0;

  function isExempt(filePath: string, propertyName: string): boolean {
    return exemptions.some(
      (exemption) => filePath.endsWith(exemption.path) && exemption.property === propertyName,
    );
  }

  function walk(type: Type, className: string, seen: Set<unknown>, depth: number): void {
    if (depth > MAX_WALK_DEPTH) return;
    const identity = type.getSymbol() ?? type;
    if (seen.has(identity)) return;
    seen.add(identity);

    for (const propertySymbol of type.getProperties()) {
      const declaration = propertyDeclaration(propertySymbol);
      if (!declaration) continue;

      const propertyName = propertySymbol.getName();
      const propertyType = declaration.getType();
      const constituents = nonNullishConstituents(propertyType);
      if (constituents.length === 0) continue;

      if (constituents.length === 1 && isRecursablePlainShape(constituents[0])) {
        walk(constituents[0], className, seen, depth + 1);
        continue;
      }

      const concept = findConcept(propertyName, registry);
      if (!concept) continue;

      scannedTargets++;
      // Every non-nullish constituent must resolve to the required VO — a mixed union like
      // `Email | string` must not pass just because one member happens to match; that still
      // lets a caller assign a raw, unvalidated string. Flag whenever the type isn't fully and
      // solely the VO AND at least one constituent is a bypassable primitive — a constituent
      // that's some other, unrelated type (not the VO, not a primitive) is a different kind of
      // mismatch, out of this rule's scope per "does NOT catch a genuinely new field type".
      const typeNames = constituents.map(
        (constituent) => constituent.getSymbol()?.getName() ?? constituent.getText(),
      );
      if (typeNames.every((name) => name === concept.requiredType)) continue;
      if (!constituents.some(isPlainPrimitive)) continue;

      const propertySourceFile = declaration.getSourceFile();
      const filePath = propertySourceFile.getFilePath();
      if (isExempt(filePath, propertyName)) continue;

      findings.push({
        rule: 'aggregate-primitive-vo',
        file: filePath,
        line: sourceLine(propertySourceFile, declaration.getStart()),
        message: `${className}.${propertyName} is typed as ${propertyType.getText()} but this codebase already has a ${concept.requiredType} value object (${concept.voFile}) for this concept — use it instead of a plain primitive.`,
      });
    }
  }

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath();
    if (!AGGREGATE_FILE.test(filePath) || sourceFile.getBaseName().endsWith('.spec.ts')) continue;

    for (const classDeclaration of sourceFile.getDescendantsOfKind(SyntaxKind.ClassDeclaration)) {
      const propsProperty = classDeclaration.getProperty('props');
      if (!propsProperty) continue;
      const propsType = propsProperty.getType();
      if (!isRecursablePlainShape(propsType)) continue;
      const className = classDeclaration.getName() ?? '<anonymous>';
      walk(propsType, className, new Set(), 0);
    }
  }

  return { rule: 'aggregate-primitive-vo', scannedTargets, findings };
}
