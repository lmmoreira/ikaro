import type { ITurnstileVerifierPort } from '../../contexts/platform/application/ports/turnstile-verifier.port';

/** Test double for `ITurnstileVerifierPort`: `result` decides the verdict, `calls` records each token. */
export class InMemoryTurnstileVerifier implements ITurnstileVerifierPort {
  result = true;
  readonly calls: { token: string; remoteIp: string }[] = [];

  async verify(token: string, remoteIp: string): Promise<boolean> {
    this.calls.push({ token, remoteIp });
    return this.result;
  }
}
