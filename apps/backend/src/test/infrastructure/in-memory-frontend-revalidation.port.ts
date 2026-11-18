import { IFrontendRevalidationPort } from '../../contexts/platform/application/ports/frontend-revalidation.port';

export class InMemoryFrontendRevalidationPort implements IFrontendRevalidationPort {
  readonly revalidatedSlugs: string[] = [];
  rejectWith: Error | null = null;

  async revalidate(slug: string): Promise<void> {
    if (this.rejectWith) {
      throw this.rejectWith;
    }
    this.revalidatedSlugs.push(slug);
  }
}
