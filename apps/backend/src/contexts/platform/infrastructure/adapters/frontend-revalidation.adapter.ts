import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { IFrontendRevalidationPort } from '../../application/ports/frontend-revalidation.port';

const REVALIDATION_TIMEOUT_MS = 5000;

@Injectable()
export class FrontendRevalidationAdapter implements IFrontendRevalidationPort {
  private readonly logger = new AppLogger(FrontendRevalidationAdapter.name);
  private readonly frontendUrl: string;
  private readonly secret: string;

  constructor(config: ConfigService) {
    this.frontendUrl = config.get<string>('FRONTEND_URL', 'http://localhost:3000');
    this.secret = config.get<string>('HOTSITE_REVALIDATE_SECRET', '');
  }

  async revalidate(slug: string): Promise<void> {
    const url = new URL('/api/revalidate', this.frontendUrl);
    url.searchParams.set('secret', this.secret);
    url.searchParams.set('slug', slug);

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(REVALIDATION_TIMEOUT_MS) });
      if (!response.ok) {
        this.logger.warn(`Hotsite revalidation request failed for slug '${slug}'`, {
          status: response.status,
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown error';
      this.logger.warn(`Hotsite revalidation request errored for slug '${slug}': ${message}`);
    }
  }
}
