export const IDENTITY_TOKEN_PROVIDER = Symbol('IIdentityTokenProvider');

export interface IIdentityTokenProvider {
  getAuthorizationHeader(audience: string): Promise<string>;
}
