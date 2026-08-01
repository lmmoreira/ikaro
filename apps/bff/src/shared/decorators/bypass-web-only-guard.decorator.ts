import { SetMetadata } from '@nestjs/common';

// TD38: WebOnlyGuard deliberately has no @Public() escape hatch — every real BFF route,
// including today's @Public() (no-JWT) ones, must prove it's ikaro-web. Cloud Run's own
// startup/liveness probes are the one legitimate exception: they're plain GETs sent by Cloud
// Run's own infrastructure with no custom headers, so they can never present
// X-Web-Internal-Key (confirmed against modules/cloudrun-service/main.tf's startup_probe/
// liveness_probe config — no http_headers block). This is a narrow, dedicated bypass — not
// @Public() — so it can't be reused to skip WebOnlyGuard on anything that isn't a Cloud Run
// health probe.
export const BYPASS_WEB_ONLY_GUARD_KEY = 'bypassWebOnlyGuard';
export const BypassWebOnlyGuard = () => SetMetadata(BYPASS_WEB_ONLY_GUARD_KEY, true);
