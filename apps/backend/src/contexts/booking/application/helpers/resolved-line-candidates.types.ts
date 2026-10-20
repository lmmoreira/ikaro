import { ResourceOccupancyCandidate } from '../ports/resource-occupancy-repository.port';

// isDegenerate carries isDegenerateService()'s verdict through to assignment time — see
// resource-occupancy-assignment.helpers.ts's effectiveLockState() for why.
export interface ResolvedLineCandidates {
  candidates: ResourceOccupancyCandidate[];
  isDegenerate: boolean;
}
