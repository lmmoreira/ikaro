import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateChatbotTables1748400000010 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "platform"."chatbot_sessions" (
        "id"                 UUID          NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"          UUID          NOT NULL,
        "client_ip"          VARCHAR(45)   NOT NULL,
        "started_at"         TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "last_message_at"    TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "conversation_date"  DATE          NOT NULL,
        "message_count"      SMALLINT      NOT NULL DEFAULT 0,
        "status"             VARCHAR(10)   NOT NULL DEFAULT 'ACTIVE',
        CONSTRAINT "PK_platform_chatbot_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_platform_chatbot_sessions_tenant_id" UNIQUE ("tenant_id", "id"),
        CONSTRAINT "FK_platform_chatbot_sessions_tenant_id" FOREIGN KEY ("tenant_id")
          REFERENCES "platform"."tenants" ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_platform_chatbot_sessions_tenant_conversation_date"
        ON "platform"."chatbot_sessions" ("tenant_id", "conversation_date")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_platform_chatbot_sessions_tenant_ip_conversation_date"
        ON "platform"."chatbot_sessions" ("tenant_id", "client_ip", "conversation_date")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_platform_chatbot_sessions_tenant_status_last_message"
        ON "platform"."chatbot_sessions" ("tenant_id", "status", "last_message_at")
    `);

    await queryRunner.query(`
      CREATE TABLE "platform"."chatbot_messages" (
        "id"             UUID          NOT NULL DEFAULT gen_random_uuid(),
        "session_id"     UUID          NOT NULL,
        "tenant_id"      UUID          NOT NULL,
        "role"           VARCHAR(9)    NOT NULL,
        "content"        TEXT          NOT NULL,
        "input_tokens"   INTEGER       NOT NULL DEFAULT 0,
        "output_tokens"  INTEGER       NOT NULL DEFAULT 0,
        "model_id"       VARCHAR(100)  NOT NULL,
        "created_at"     TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_platform_chatbot_messages" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_platform_chatbot_messages_role" CHECK ("role" IN ('USER', 'ASSISTANT')),
        CONSTRAINT "FK_platform_chatbot_messages_tenant_session"
          FOREIGN KEY ("tenant_id", "session_id")
          REFERENCES "platform"."chatbot_sessions" ("tenant_id", "id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_platform_chatbot_messages_tenant_session"
        ON "platform"."chatbot_messages" ("tenant_id", "session_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_platform_chatbot_messages_created_at"
        ON "platform"."chatbot_messages" ("created_at")
    `);

    await queryRunner.query(`
      CREATE TABLE "platform"."chatbot_provider_balance" (
        "provider"       VARCHAR(32)     NOT NULL,
        "remaining_usd"  NUMERIC(10,4)   NOT NULL,
        "checked_at"     TIMESTAMPTZ     NOT NULL DEFAULT now(),
        CONSTRAINT "PK_platform_chatbot_provider_balance" PRIMARY KEY ("provider")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "platform"."chatbot_provider_balance"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "platform"."chatbot_messages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "platform"."chatbot_sessions"`);
  }
}
