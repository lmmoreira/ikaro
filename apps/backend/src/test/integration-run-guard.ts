// The integration project cannot run without `--experimental-vm-modules`: @google-cloud/storage's
// transitive teeny-request does an unconditional dynamic import('node-fetch') (pure ESM), which
// Jest's default CJS mode rejects with "A dynamic import callback was invoked without
// --experimental-vm-modules". The flag is set by the `test` and `test:integration` scripts only, so
// a bare `jest ...` (or an IDE runner) used to fail in the middle of a real-storage spec while the
// same suite passed through the script — it looked like a flake, and was an invocation difference.
// (docs/TESTING_STRATEGY.md § Real-GCS-emulator integration tests (opt-in `useRealStorage`))
// Failing here, before any container starts, makes that a deterministic, self-explaining error.
export const VM_MODULES_FLAG = '--experimental-vm-modules';

export function assertIntegrationRunEnvironment(nodeOptions: string | undefined): void {
  if ((nodeOptions ?? '').split(/\s+/).includes(VM_MODULES_FLAG)) return;
  throw new Error(
    `The integration project must run with NODE_OPTIONS="${VM_MODULES_FLAG}" (see docs/TESTING_STRATEGY.md). ` +
      'Run it through `pnpm --filter @ikaro/backend test:integration`, or set NODE_OPTIONS yourself.',
  );
}
