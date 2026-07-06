// Replaces server-only in the Vitest environment.
// The real module throws when its "browser"/client conditional export is resolved — Vitest's
// module resolution doesn't distinguish Server vs Client Components the way Next.js's bundler
// does, so importing it directly in a node/jsdom test always hits that throwing branch.
export {};
