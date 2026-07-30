import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVersionToHotsiteConfigs1748400000009 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE platform.hotsite_configs ADD COLUMN version INTEGER NOT NULL DEFAULT 1`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE platform.hotsite_configs DROP COLUMN version`);
  }
}
