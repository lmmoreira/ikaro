export interface OidcTokenPayload {
  iss?: string;
  email?: string;
  email_verified?: boolean;
}

export const OIDC_TOKEN_VERIFIER = Symbol('OIDC_TOKEN_VERIFIER');

export interface IOidcTokenVerifier {
  verify(idToken: string, audience: string): Promise<OidcTokenPayload>;
}
