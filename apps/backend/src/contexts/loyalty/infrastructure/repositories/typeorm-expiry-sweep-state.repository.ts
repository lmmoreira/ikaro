import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IExpirySweepStateRepository } from '../../application/ports/expiry-sweep-state-repository.port';
import { ExpirySweepStateEntity } from '../entities/expiry-sweep-state.entity';

export const EXPIRY_SWEEP_JOB_NAME = 'loyalty-expiry-sweep';

@Injectable()
export class TypeOrmExpirySweepStateRepository implements IExpirySweepStateRepository {
  constructor(
    @InjectRepository(ExpirySweepStateEntity)
    private readonly repo: Repository<ExpirySweepStateEntity>,
  ) {}

  async getProcessedThrough(): Promise<Date | null> {
    const row = await this.repo.findOne({ where: { jobName: EXPIRY_SWEEP_JOB_NAME } });
    return row?.processedThrough ?? null;
  }

  // GREATEST so the watermark only ever moves forward, whichever overlapping run finishes last.
  async advanceTo(processedThrough: Date): Promise<void> {
    await this.repo.query(
      `INSERT INTO loyalty.expiry_sweep_state (job_name, processed_through)
       VALUES ($1, $2)
       ON CONFLICT (job_name) DO UPDATE
         SET processed_through = GREATEST(
               loyalty.expiry_sweep_state.processed_through, EXCLUDED.processed_through),
             updated_at = now()`,
      [EXPIRY_SWEEP_JOB_NAME, processedThrough],
    );
  }
}
