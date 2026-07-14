import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { INBOX_REPOSITORY } from '../../ports/inbox.port';
import { InboxRecordEntity } from './inbox-record.entity';
import { TypeOrmInboxRepository } from './typeorm-inbox.repository';

// @Global() (TD24-S04): INBOX_REPOSITORY has consumers across 3 contexts (loyalty, notification,
// staff) — matching OutboxModule's own @Global() pattern so context modules don't each need an
// explicit InboxModule import.
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([InboxRecordEntity])],
  providers: [{ provide: INBOX_REPOSITORY, useClass: TypeOrmInboxRepository }],
  exports: [INBOX_REPOSITORY],
})
export class InboxModule {}
