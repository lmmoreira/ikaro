import { Global, Module } from '@nestjs/common';
import { APPLICATION_CONFIG } from '../ports/application-config.port';
import { NestApplicationConfigAdapter } from './nest-application-config.adapter';

@Global()
@Module({
  providers: [{ provide: APPLICATION_CONFIG, useClass: NestApplicationConfigAdapter }],
  exports: [APPLICATION_CONFIG],
})
export class ApplicationConfigModule {}
