import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSeoToHotsiteConfigs1748400000001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE platform.hotsite_configs ADD COLUMN seo JSONB NOT NULL DEFAULT '{"title": null, "description": null}'::jsonb`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE platform.hotsite_configs DROP COLUMN seo`);
  }
}
