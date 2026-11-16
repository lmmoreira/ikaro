import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IExpirySweepStateRepository } from '../../application/ports/expiry-sweep-state-repository.port';
import { ExpirySweepStateEntity } from '../entities/expiry-sweep-state.entity';

const SINGLE_ROW_ID = 1;

@Injectable()
export class TypeOrmExpirySweepStateRepository implements IExpirySweepStateRepository {
  constructor(
    @InjectRepository(ExpirySweepStateEntity)
    private readonly repo: Repository<ExpirySweepStateEntity>,
  ) {}

  async getProcessedThrough(): Promise<Date | null> {
    const row = await this.repo.findOne({ where: { id: SINGLE_ROW_ID } });
    return row?.processedThrough ?? null;
  }

  // GREATEST so the watermark only ever moves forward, whichever overlapping run finishes last.
  async advanceTo(processedThrough: Date): Promise<void> {
    await this.repo.query(
      `INSERT INTO loyalty.expiry_sweep_state (id, processed_through)
       VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE
         SET processed_through = GREATEST(
               loyalty.expiry_sweep_state.processed_through, EXCLUDED.processed_through),
             updated_at = now()`,
      [SINGLE_ROW_ID, processedThrough],
    );
  }
}
