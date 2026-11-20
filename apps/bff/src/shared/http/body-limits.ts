import { INestApplication } from '@nestjs/common';
import { json, NextFunction, Request, Response, urlencoded } from 'express';

// A real provider webhook is a few kilobytes; nothing legitimate on that path comes near this.
export const WEBHOOK_BODY_LIMIT = '64kb';

const WEBHOOK_PATH = '/v1/public/billing/webhooks';

/**
 * The JSON parser of the webhook path, with one difference: bytes that are not valid JSON do not
 * fail the request here. The parser would answer `400` before the controller could authenticate the
 * caller, and an authenticated body nobody can read is acknowledged with `200` (a retry could never
 * succeed and a non-2xx counts toward the provider's failure pause). The body is left `null`, which
 * the backend adapter reads as unreadable. Every other parser error, an oversized body included,
 * still fails the request.
 */
function tolerantWebhookJson(): (req: Request, res: Response, next: NextFunction) => void {
  const parse = json({ limit: WEBHOOK_BODY_LIMIT });
  return (req, res, next) =>
    parse(req, res, (err?: unknown) => {
      if ((err as { type?: string } | undefined)?.type === 'entity.parse.failed') {
        req.body = null;
        next();
        return;
      }
      next(err);
    });
}

/**
 * The BFF's request body limits. The webhook route is public and called by an external party, so it
 * gets its own small limit; it is registered first because the first parser to run consumes the
 * body and the later ones skip it. Everything else keeps the 10 MB limit that covers high-quality
 * phone photos.
 */
export function applyBodyLimits(app: INestApplication): void {
  // Both parsers, whichever content type the caller claims: each global parser would otherwise read
  // up to 10 MB of this public route's body before the controller checks the token.
  app.use(WEBHOOK_PATH, tolerantWebhookJson());
  app.use(WEBHOOK_PATH, urlencoded({ limit: WEBHOOK_BODY_LIMIT, extended: true }));
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ limit: '10mb', extended: true }));
}
