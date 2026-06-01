import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotificationTemplates1748100000010 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notification"."notification_templates" (
        "id"            UUID          NOT NULL,
        "tenant_id"     UUID          NULL,
        "trigger_event" VARCHAR(100)  NOT NULL,
        "channel"       VARCHAR(20)   NOT NULL DEFAULT 'EMAIL',
        "subject"       VARCHAR(255)  NOT NULL,
        "body"          TEXT          NOT NULL,
        "created_at"    TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updated_at"    TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notification_templates" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_notification_templates_global"
        ON "notification"."notification_templates" ("trigger_event", "channel")
        WHERE "tenant_id" IS NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_notification_templates_tenant"
        ON "notification"."notification_templates" ("tenant_id", "trigger_event", "channel")
        WHERE "tenant_id" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_notification_templates_tenant_id"
        ON "notification"."notification_templates" ("tenant_id")
    `);

    // Seed global defaults (tenant_id = NULL)
    await queryRunner.query(`
      INSERT INTO "notification"."notification_templates"
        ("id", "tenant_id", "trigger_event", "channel", "subject", "body")
      VALUES
        (gen_random_uuid(), NULL, 'booking-requested-admin', 'EMAIL',
         'Novo agendamento recebido',
         '<p>Nova solicitação de agendamento recebida.</p><p><strong>Cliente:</strong> {{guestName}}</p><p><strong>Data/Hora:</strong> {{scheduledAt}}</p><p><strong>Serviços:</strong> {{serviceNames}}</p><p><strong>Total:</strong> {{totalPrice}}</p>{{pickupAddressLine}}'
        ),
        (gen_random_uuid(), NULL, 'booking-requested-customer', 'EMAIL',
         'Solicitação de agendamento recebida',
         '<p>Olá, {{guestName}}!</p><p>Recebemos sua solicitação de agendamento em <strong>{{tenantName}}</strong>.</p><p><strong>Serviços:</strong> {{serviceNames}}</p><p><strong>Data/Hora:</strong> {{scheduledAt}}</p><p><strong>Total:</strong> {{totalPrice}}</p><p>Entraremos em contato para confirmar seu agendamento.</p>'
        ),
        (gen_random_uuid(), NULL, 'booking-approved-customer', 'EMAIL',
         'Seu agendamento foi confirmado!',
         '<p>Olá, {{guestName}}!</p><p>Seu agendamento foi confirmado.</p><p><strong>Data:</strong> {{localDate}}</p><p><strong>Horário:</strong> {{localTime}}</p><p><strong>Serviços:</strong> {{serviceNames}}</p><p><strong>Total:</strong> {{totalPrice}}</p><p>Aguardamos sua visita!</p>'
        ),
        (gen_random_uuid(), NULL, 'booking-rejected-customer', 'EMAIL',
         'Agendamento não confirmado',
         '<p>Olá, {{guestName}}!</p><p>Infelizmente não foi possível confirmar seu agendamento.</p><p><strong>Motivo:</strong> {{reason}}</p><p>Se desejar, realize um novo agendamento em nosso site.</p>'
        ),
        (gen_random_uuid(), NULL, 'booking-info-requested-customer', 'EMAIL',
         'Precisamos de mais informações sobre seu agendamento',
         '<p>Olá, {{guestName}}!</p><p>Nossa equipe precisa de mais informações antes de confirmar seu agendamento.</p><p><strong>Informações necessárias:</strong> {{informationNeeded}}</p><p><a href="{{respondLink}}">Clique aqui para responder</a></p>'
        ),
        (gen_random_uuid(), NULL, 'booking-info-submitted-admin', 'EMAIL',
         'Cliente respondeu à solicitação de informações',
         '<p>O cliente <strong>{{submittedByEmail}}</strong> respondeu à solicitação de informações.</p><p><strong>Resposta:</strong> {{customerResponse}}</p><p><a href="{{bookingLink}}">Ver agendamento no dashboard</a></p>'
        ),
        (gen_random_uuid(), NULL, 'booking-cancelled-customer', 'EMAIL',
         'Seu agendamento foi cancelado',
         '<p>Olá, {{guestName}}!</p><p>Seu agendamento foi cancelado.</p><p><strong>Data:</strong> {{localDate}}</p><p><strong>Horário:</strong> {{localTime}}</p><p><strong>Serviços:</strong> {{serviceNames}}</p><p><strong>Total:</strong> {{totalPrice}}</p><p>Se desejar, realize um novo agendamento em nosso site.</p>'
        ),
        (gen_random_uuid(), NULL, 'booking-cancelled-admin', 'EMAIL',
         'Agendamento cancelado',
         '<p>Agendamento cancelado.</p><p><strong>Cliente:</strong> {{guestName}}</p><p><strong>Data:</strong> {{localDate}}</p><p><strong>Horário:</strong> {{localTime}}</p><p><strong>Serviços:</strong> {{serviceNames}}</p><p><strong>Total:</strong> {{totalPrice}}</p><p>{{cancelledByLine}}</p>{{reasonLine}}'
        ),
        (gen_random_uuid(), NULL, 'booking-rescheduled-customer', 'EMAIL',
         'Seu agendamento foi reagendado',
         '<p>Olá, {{guestName}}!</p><p>Seu agendamento foi reagendado.</p><p><strong>Data anterior:</strong> {{previousLocalDate}} às {{previousLocalTime}}</p><p><strong>Nova data:</strong> {{newLocalDate}} às {{newLocalTime}}</p><p><strong>Serviços:</strong> {{serviceNames}}</p><p><strong>Total:</strong> {{totalPrice}}</p><p>Aguardamos sua visita!</p>'
        ),
        (gen_random_uuid(), NULL, 'booking-rescheduled-admin', 'EMAIL',
         'Agendamento reagendado',
         '<p>Agendamento reagendado.</p><p><strong>Cliente:</strong> {{guestName}}</p><p><strong>Data anterior:</strong> {{previousLocalDate}} às {{previousLocalTime}}</p><p><strong>Nova data:</strong> {{newLocalDate}} às {{newLocalTime}}</p><p><strong>Serviços:</strong> {{serviceNames}}</p><p><strong>Total:</strong> {{totalPrice}}</p>'
        ),
        (gen_random_uuid(), NULL, 'booking-reminder-due', 'EMAIL',
         'Lembrete: seu agendamento é amanhã!',
         '<p>Olá, {{guestName}}!</p><p>Lembramos que seu agendamento é <strong>amanhã</strong>.</p><p><strong>Data:</strong> {{localDate}}</p><p><strong>Horário:</strong> {{localTime}}</p><p><strong>Serviços:</strong> {{serviceNames}}</p><p>Até amanhã!</p>'
        ),
        (gen_random_uuid(), NULL, 'booking-reminder-due-today', 'EMAIL',
         'Lembrete: seu agendamento é hoje!',
         '<p>Olá, {{guestName}}!</p><p>Lembramos que seu agendamento é <strong>hoje</strong>.</p><p><strong>Horário:</strong> {{localTime}}</p><p><strong>Serviços:</strong> {{serviceNames}}</p><p>Estamos esperando você!</p>'
        ),
        (gen_random_uuid(), NULL, 'admin-daily-schedule-reminder', 'EMAIL',
         'Agenda do dia — {{localDate}}',
         '<p>Olá!</p><p>Veja a agenda de hoje, <strong>{{localDate}}</strong>:</p><p>{{bookingsSummary}}</p>'
        ),
        (gen_random_uuid(), NULL, 'service-points-earned', 'EMAIL',
         'Lavagem concluída! Você ganhou {{totalPointsEarned}} pontos',
         '<p>Olá, {{customerName}}!</p><p>Sua lavagem foi concluída e você ganhou <strong>{{totalPointsEarned}} pontos</strong> de fidelidade.</p><p>Seu saldo atual é de <strong>{{currentBalance}} pontos</strong>.</p><p>Use seus pontos no próximo agendamento!</p>'
        ),
        (gen_random_uuid(), NULL, 'points-expiring-soon', 'EMAIL',
         'Seus pontos de fidelidade estão prestes a expirar!',
         '<p>Olá, {{customerName}}!</p><p>Você tem <strong>{{pointsExpiringSoon}} pontos</strong> prestes a expirar em {{earliestExpiresAt}}.</p><p>Realize um agendamento para utilizar seus pontos antes que expirem.</p>'
        ),
        (gen_random_uuid(), NULL, 'staff-invitation', 'EMAIL',
         'Você foi convidado para a equipe {{tenantName}}',
         '<p>Olá, {{staffName}}!</p><p>Você foi convidado para integrar a equipe de <strong>{{tenantName}}</strong> na plataforma BeloAuto.</p><p><a href="{{activationLink}}">Clique aqui para aceitar o convite e acessar sua conta.</a></p><p>Se você não esperava este convite, por favor ignore este e-mail.</p>'
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "notification"."notification_templates"`);
  }
}
