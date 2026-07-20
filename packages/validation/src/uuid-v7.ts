import { randomBytes } from 'node:crypto';

// Single source of truth for uuidv7()/isUuidV7() (M17-S31 review, 2026-07-20) — previously
// duplicated byte-for-byte between apps/backend/src/shared/domain/uuid-v7.ts and
// apps/bff/src/shared/domain/uuid-v7.ts, which tripped SonarCloud's new-code duplication
// gate (>3% threshold) the moment a second identical function (isUuidV7) was added to both
// copies. Lives here (not @ikaro/types) because this package's own package.json declares
// exactly the constraint this needs: "Shared ... schemas for backend and bff — never
// consumed by apps/web" — @ikaro/types's main barrel IS imported by apps/web, and this file's
// node:crypto import must never reach a browser/edge bundle. Also sidesteps a real blocker:
// backend/BFF's tsconfig uses classic "moduleResolution": "Node", which doesn't understand
// package.json "exports" subpaths, so a `@ikaro/types/uuid-v7` subpath export (tried first)
// failed to type-check — this package's plain main-barrel export needs no subpath at all.
// Both apps' own shared/domain/uuid-v7.ts files re-export from here, so every existing
// backend import site (~40 files) keeps working unchanged.
export function uuidv7(): string {
  const bytes = randomBytes(16);
  const now = BigInt(Date.now());
  bytes[0] = Number((now >> 40n) & 0xffn);
  bytes[1] = Number((now >> 32n) & 0xffn);
  bytes[2] = Number((now >> 24n) & 0xffn);
  bytes[3] = Number((now >> 16n) & 0xffn);
  bytes[4] = Number((now >> 8n) & 0xffn);
  bytes[5] = Number(now & 0xffn);
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = bytes.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// version nibble '7' and RFC 4122 variant nibble (8/9/a/b) — matches the shape uuidv7()
// itself produces, so an incoming value either matches this exact contract or is rejected
// (used by both apps' CorrelationMiddleware to avoid trusting an unvalidated client-supplied
// X-Correlation-ID verbatim).
const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidV7(value: string): boolean {
  return UUID_V7_PATTERN.test(value);
}
