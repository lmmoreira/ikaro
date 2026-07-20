// Real implementation moved to @ikaro/validation (M17-S31 review, 2026-07-20) — this file
// used to duplicate it byte-for-byte with apps/bff/src/shared/domain/uuid-v7.ts, which
// tripped SonarCloud's new-code duplication gate. Re-exporting here keeps every existing
// import site in this app (~40 files) unchanged.
export { isUuidV7, uuidv7 } from '@ikaro/validation';
