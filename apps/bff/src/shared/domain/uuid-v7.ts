import { randomBytes } from 'node:crypto';

// Mirrors apps/backend/src/shared/domain/uuid-v7.ts — kept as a small duplicated pure
// function rather than a new shared package, since backend and BFF are otherwise
// deliberately decoupled (docs/ANTI_PATTERNS.md's backend/@ikaro/types row). The BFF is the
// origin point for correlationId on a fresh browser request (no upstream sets
// X-Correlation-ID), so it must mint the same uuid-v7 format the domain event envelope
// requires (CLAUDE.md §4) — a v4 randomUUID() here would ship a non-compliant correlationId
// into every event for that request.
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
