export const PROCESSED_EVENT_REPOSITORY = Symbol('IProcessedEventRepository');

export interface IProcessedEventRepository {
  hasBeenProcessed(eventId: string, consumerName: string): Promise<boolean>;
  markProcessed(eventId: string, consumerName: string): Promise<void>;
}
