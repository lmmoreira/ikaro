export { checkAggregatePropsUseSharedValueObjects } from './detectors/aggregate-primitive-vo';
export { checkBffTypesLiveInModuleFiles } from './detectors/bff-controller-type-placement';
export type { BffInlineTypeException } from './detectors/bff-controller-type-placement';
export { checkClosedEnumRegistry } from './detectors/closed-enum-registry';
export type {
  ClosedEnumMemberKind,
  ClosedEnumRegistryEntry,
  ClosedEnumSource,
} from './detectors/closed-enum-registry';
export type {
  AggregatePrimitiveVoExemption,
  AggregateValueObjectConcept,
} from './detectors/aggregate-primitive-vo';
export { checkEntityBuilderPrimaryKeyDefaults } from './detectors/entity-builder-pk-default';
export { checkErrorMapperCoverage } from './detectors/error-mappers';
export type { ErrorMapperException } from './detectors/error-mappers';
export { checkIkaroTypesDrift } from './detectors/ikaro-types-drift';
export type { IkaroTypesDriftException } from './detectors/ikaro-types-drift';
export { checkNoJestFnForRepositoryOrPortMocks } from './detectors/jest-fn-port-mock';
export { checkPrototypeChainSafety } from './detectors/prototype-chain';
export { checkSharedValueObjectErrorMapperCoverage } from './detectors/shared-vo-error-mapping';
export { checkTestBuilderCoverage } from './detectors/test-builder-coverage';
export { checkTestDataHarnessRegistrations } from './detectors/test-harness-registration';
export type { TestDataHarnessRegistration } from './detectors/test-harness-registration';
export { checkTransactionalIo } from './detectors/transactional-io';
export { checkTransactionalSaves } from './detectors/transactional-save';
export {
  checkGlobalModuleExportPairing,
  checkReverseDiAlias,
  checkUnsafeUseExisting,
} from './detectors/di-alias';
export { checkValueObjectCreateNeverThrowsBareError } from './detectors/vo-bare-error';
export { checkPrimitiveFieldsValidatedAtConstruction } from './detectors/vo-construction-validation';
export type { ConstructionValidationTarget } from './detectors/vo-construction-validation';
export { checkUseCaseInputNaming, checkUseCaseResultNaming } from './detectors/use-case-naming';
export type { ExternalSideEffectPort } from './detectors/transactional-io';
export { mergeScanResults } from './model';
export type { Finding, ScanResult } from './model';
