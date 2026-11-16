import { Envelope } from '../domain/envelope';
import { IOutboxPublisher } from '../ports/outbox-publisher.port';
import { ITransactionManager } from '../ports/transaction-manager.port';
import { mapSequentially } from './sequential';

export const OUTBOX_PUBLISH_CHUNK_SIZE = 500;

export interface OutboxChunkWriter {
  txManager: ITransactionManager;
  outboxPublisher: IOutboxPublisher;
}

// Writes outbox rows one bounded transaction per chunk, never one transaction for the whole list.
// A producer whose row count follows tenant data (a reminder per booking, a notice per customer)
// otherwise holds one transaction open for as many inserts as that tenant has data.
//
// Every envelope must carry a deterministic dedupKey (a Command does; a DomainEvent is identified
// by its eventId): a crash between two chunks leaves the first committed and the retry re-inserts
// it as a no-op conflict, so the rerun finishes the rest and never writes a row twice. Reads the
// envelopes were built from run before this is called, outside any transaction.
export async function publishToOutboxInChunks(
  writer: OutboxChunkWriter,
  envelopes: readonly Envelope[],
  chunkSize: number = OUTBOX_PUBLISH_CHUNK_SIZE,
): Promise<void> {
  if (!Number.isInteger(chunkSize) || chunkSize < 1) {
    throw new RangeError(`chunkSize must be a positive integer, got ${chunkSize}`);
  }
  const chunks: Envelope[][] = [];
  for (let start = 0; start < envelopes.length; start += chunkSize) {
    chunks.push(envelopes.slice(start, start + chunkSize));
  }
  await mapSequentially(chunks, (chunk) =>
    writer.txManager.run(async () => {
      await mapSequentially(chunk, (envelope) => writer.outboxPublisher.publish(envelope));
    }),
  );
}
