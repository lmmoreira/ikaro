export const FRONTEND_REVALIDATION_PORT = Symbol('IFrontendRevalidationPort');

export interface IFrontendRevalidationPort {
  revalidate(slug: string): Promise<void>;
}
