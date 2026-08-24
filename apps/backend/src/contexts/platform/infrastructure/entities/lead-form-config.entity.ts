import { Column, Entity, PrimaryColumn } from 'typeorm';
import { LeadFormAudienceMode, LeadFormQuestion } from '../../domain/lead-form-config.aggregate';

@Entity('lead_form_configs', { schema: 'platform' })
export class LeadFormConfigEntity {
  @PrimaryColumn({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'audience_mode', type: 'varchar', length: 20 })
  audienceMode!: LeadFormAudienceMode;

  @Column({ type: 'jsonb' })
  questions!: LeadFormQuestion[];

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
