import { InterfaceDeclaration, Node, Project, SyntaxKind, Type } from 'ts-morph';
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

function resolvePlainInterface(type: Type): InterfaceDeclaration | undefined {
  return type.getSymbol()?.getDeclarations().find(Node.isInterfaceDeclaration);
}

function isClassType(type: Type): boolean {
  return Boolean(type.getSymbol()?.getDeclarations().some(Node.isClassDeclaration));
}

// Aggregate props typed as primitive when a VO exists (bad-smell-audit BE-1, TD37-S09).
// Resolves each aggregate class's own `props: XxxProps` field and walks its shape, recursing
// through plain nested object types (organizational sub-shapes of the SAME props tree, e.g.
// HotsiteConfigProps.branding: HotsiteBrandingProps) but stopping the moment a property
// resolves to a class/VO type. A class-typed field already encapsulates its own internals per
// Option A ("aggregate props interfaces use VO types") — that VO's own private representation
// (e.g. TenantSettings' internal TenantSettingsData, validated by its own Validator classes) is
// that VO's concern, not a flat property of the aggregate this check enforces.
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

  function walk(
    interfaceDeclaration: InterfaceDeclaration,
    className: string,
    seen: Set<InterfaceDeclaration>,
  ): void {
    if (seen.has(interfaceDeclaration)) return;
    seen.add(interfaceDeclaration);

    for (const property of interfaceDeclaration.getProperties()) {
      const propertyName = property.getName();
      const propertyType = property.getType();
      const constituents = nonNullishConstituents(propertyType);
      if (constituents.length === 0) continue;

      if (constituents.length === 1 && !isClassType(constituents[0])) {
        const nestedInterface = resolvePlainInterface(constituents[0]);
        if (nestedInterface) {
          walk(nestedInterface, className, seen);
          continue;
        }
      }

      const concept = findConcept(propertyName, registry);
      if (!concept) continue;

      scannedTargets++;
      const typeNames = constituents.map(
        (constituent) => constituent.getSymbol()?.getName() ?? constituent.getText(),
      );
      if (typeNames.includes(concept.requiredType)) continue;
      if (!constituents.every(isPlainPrimitive)) continue;

      const propertySourceFile = property.getSourceFile();
      const filePath = propertySourceFile.getFilePath();
      if (isExempt(filePath, propertyName)) continue;

      findings.push({
        rule: 'aggregate-primitive-vo',
        file: filePath,
        line: sourceLine(propertySourceFile, property.getStart()),
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
      const propsInterface = resolvePlainInterface(propsProperty.getType());
      if (!propsInterface) continue;
      const className = classDeclaration.getName() ?? '<anonymous>';
      walk(propsInterface, className, new Set());
    }
  }

  return { rule: 'aggregate-primitive-vo', scannedTargets, findings };
}
