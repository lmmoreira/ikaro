import { INestApplication } from '@nestjs/common';
import { json, urlencoded } from 'express';

// A real provider webhook is a few kilobytes; nothing legitimate on that path comes near this.
export const WEBHOOK_BODY_LIMIT = '64kb';

/**
 * The BFF's request body limits. The webhook route is public and called by an external party, so it
 * gets its own small limit; it is registered first because the first parser to run consumes the
 * body and the later ones skip it. Everything else keeps the 10 MB limit that covers high-quality
 * phone photos.
 */
export function applyBodyLimits(app: INestApplication): void {
  app.use('/v1/public/billing/webhooks', json({ limit: WEBHOOK_BODY_LIMIT }));
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ limit: '10mb', extended: true }));
}
