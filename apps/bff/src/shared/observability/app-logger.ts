import { Injectable } from '@nestjs/common';
import { BaseAppLogger, createLogVendorFormatter } from '@ikaro/observability';

@Injectable()
export class AppLogger extends BaseAppLogger {
  constructor(context?: string) {
    super(
      'bff',
      createLogVendorFormatter({
        vendor: process.env['LOG_VENDOR'],
        gcp: {
          projectId: process.env['GCP_PROJECT'],
        },
      }),
      context,
    );
  }
}
