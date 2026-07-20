import { Module } from '@nestjs/common';
import { RequestContext } from './request-context';

@Module({
  providers: [RequestContext],
  exports: [RequestContext],
})
export class RequestModule {}
