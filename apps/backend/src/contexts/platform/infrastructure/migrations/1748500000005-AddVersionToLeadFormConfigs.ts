import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Mirrors 1748400000009-AddVersionToHotsiteConfigs.ts — lead_form_configs had no version guard at
 * all, so two concurrent PATCH /v1/tenants/hotsite saves (audienceMode/questions are optional
 * extra fields on that same endpoint) could silently last-write-wins, exactly the gap that
 * migration closed for the sibling aggregate written in the same transaction (Codex review,
 * M20-S08 PR #429, 2026-08-26).
 */
export class AddVersionToLeadFormConfigs1748500000005 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE platform.lead_form_configs ADD COLUMN version INTEGER NOT NULL DEFAULT 1`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE platform.lead_form_configs DROP COLUMN version`);
  }
}
