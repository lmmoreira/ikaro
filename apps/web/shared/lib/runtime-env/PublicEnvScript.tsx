import { getServerPublicEnv } from './public-env';

function serialize(): string {
  const backslash = String.fromCodePoint(92);
  return JSON.stringify(getServerPublicEnv()).replaceAll('<', `${backslash}u003c`);
}

// Server Component, rendered once per request by the root layout, before any client content —
// gives client-bundled code (bff-client.ts, hotsite image resolution, logout URLs, etc.) a real
// per-environment value at runtime instead of whatever got frozen in at `next build` time (TD29).
export function PublicEnvScript(): React.JSX.Element {
  return <script>{`window.__PUBLIC_ENV__=${serialize()}`}</script>;
}
