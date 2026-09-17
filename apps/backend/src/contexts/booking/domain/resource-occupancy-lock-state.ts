// 'REQUESTED' (M22-S03, story-discovery follow-up 2026-09-16) — a degenerate-service (LOCATION
// fallback / today's car-wash-style model) booking's occupancy row at request time. Deliberately
// excluded from the exclusion constraint's own WHERE clause (see the migration) so concurrent
// PENDING requests for the same slot stay allowed, matching today's exact byte-identical
// behavior — only a REAL resource-scoped service (M23+) gets HOLD's full pre-approval exclusivity.
// Transitions to COMMITTED on approval, same as HOLD.
export type ResourceOccupancyLockState = 'REQUESTED' | 'HOLD' | 'COMMITTED';
