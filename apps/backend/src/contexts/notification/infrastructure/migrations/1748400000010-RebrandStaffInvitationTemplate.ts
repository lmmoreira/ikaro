import { MigrationInterface, QueryRunner } from 'typeorm';

const OLD_BODY =
  '<p>Olá, {{staffName}}!</p><p>Você foi convidado para integrar a equipe de <strong>{{tenantName}}</strong> na plataforma BeloAuto.</p><p><a href="{{activationLink}}">Clique aqui para aceitar o convite e acessar sua conta.</a></p><p>Se você não esperava este convite, por favor ignore este e-mail.</p>';

const NEW_BODY =
  '<p>Olá, {{staffName}}!</p><p>Você foi convidado para integrar a equipe de <strong>{{tenantName}}</strong> na plataforma Ikaro.</p><p><a href="{{activationLink}}">Clique aqui para aceitar o convite e acessar sua conta.</a></p><p>Se você não esperava este convite, por favor ignore este e-mail.</p>';

export class RebrandStaffInvitationTemplate1748400000010 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "notification"."notification_templates"
       SET "body" = $1
       WHERE "trigger_event" = 'staff-invitation' AND "body" = $2`,
      [NEW_BODY, OLD_BODY],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "notification"."notification_templates"
       SET "body" = $1
       WHERE "trigger_event" = 'staff-invitation' AND "body" = $2`,
      [OLD_BODY, NEW_BODY],
    );
  }
}
