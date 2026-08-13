export { checkErrorMapperCoverage } from './detectors/error-mappers';
export { checkTransactionalIo } from './detectors/transactional-io';
export { checkTransactionalSaves } from './detectors/transactional-save';
export { checkUnsafeUseExisting } from './detectors/di-alias';
export type { ExternalSideEffectPort } from './detectors/transactional-io';
export type { Finding, ScanResult } from './model';
