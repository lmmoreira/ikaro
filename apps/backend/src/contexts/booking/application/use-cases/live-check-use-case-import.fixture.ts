// Throwaway: proves the dependency-graph gate fails a use case importing another use case. Never merged.
import { GetAvailabilityUseCase } from './get-availability.use-case';

export const liveCheckUseCaseImport = GetAvailabilityUseCase;
