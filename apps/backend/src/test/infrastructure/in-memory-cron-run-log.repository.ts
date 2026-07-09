import { ICronRunLogRepository } from '../../shared/ports/cron-run-log-repository.port';

export class InMemoryCronRunLogRepository implements ICronRunLogRepository {
  private readonly runs = new Set<string>();

  private key(tenantId: string, cronDate: string, reminderType: string): string {
    return `${tenantId}:${cronDate}:${reminderType}`;
  }

  async hasRun(tenantId: string, cronDate: string, reminderType: string): Promise<boolean> {
    return this.runs.has(this.key(tenantId, cronDate, reminderType));
  }

  async markRun(tenantId: string, cronDate: string, reminderType: string): Promise<void> {
    this.runs.add(this.key(tenantId, cronDate, reminderType));
  }

  clear(): void {
    this.runs.clear();
  }
}
