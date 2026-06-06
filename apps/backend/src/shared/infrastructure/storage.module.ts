import { Module } from '@nestjs/common';
import { STORAGE_SERVICE } from '../ports/storage.service.port';
import { GcsSignedUrlAdapter } from './gcs-signed-url.adapter';

@Module({
  providers: [{ provide: STORAGE_SERVICE, useClass: GcsSignedUrlAdapter }],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
