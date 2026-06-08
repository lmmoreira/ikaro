import { IFrontendRevalidationPort } from '../../contexts/platform/application/ports/frontend-revalidation.port';

export class InMemoryFrontendRevalidationPort implements IFrontendRevalidationPort {
  readonly revalidatedSlugs: string[] = [];

  async revalidate(slug: string): Promise<void> {
    this.revalidatedSlugs.push(slug);
  }
}
