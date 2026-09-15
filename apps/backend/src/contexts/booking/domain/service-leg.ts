import { ValueObject } from '../../../shared/domain/value-object';
import { normalizeText } from '../../../shared/utils/text-normalization';
import { ServiceLegInvalidError } from './errors/booking-service.error';
import { ResourceRequirement, ResourceRequirementProps } from './resource-requirement';

export interface ServiceLegProps {
  legIndex: number;
  name: string;
  durationMinutes: number;
  resourceRequirements: ResourceRequirement[];
  transitionGapAfterMinutes: number;
}

export interface CreateServiceLegProps {
  legIndex: number;
  name: string;
  durationMinutes: number;
  resourceRequirements: ResourceRequirement[];
  transitionGapAfterMinutes?: number;
}

export interface ServiceLegReconstituteProps {
  legIndex: number;
  name: string;
  durationMinutes: number;
  resourceRequirements: ResourceRequirementProps[];
  transitionGapAfterMinutes: number;
}

export class ServiceLeg extends ValueObject<ServiceLegProps> {
  private constructor(props: ServiceLegProps) {
    super(props);
  }

  static create(props: CreateServiceLegProps): ServiceLeg {
    const normalizedName = normalizeText(props.name);
    if (!normalizedName) throw new ServiceLegInvalidError('name-required');
    if (props.legIndex < 0) throw new ServiceLegInvalidError('leg-index-must-be-non-negative');
    if (props.durationMinutes <= 0) {
      throw new ServiceLegInvalidError('duration-must-be-positive');
    }
    if (props.resourceRequirements.length === 0) {
      throw new ServiceLegInvalidError('requires-resource-requirement');
    }
    const transitionGapAfterMinutes = props.transitionGapAfterMinutes ?? 0;
    if (transitionGapAfterMinutes < 0) {
      throw new ServiceLegInvalidError('transition-gap-must-be-non-negative');
    }
    return new ServiceLeg({
      legIndex: props.legIndex,
      name: normalizedName,
      durationMinutes: props.durationMinutes,
      resourceRequirements: [...props.resourceRequirements],
      transitionGapAfterMinutes,
    });
  }

  static reconstitute(props: ServiceLegReconstituteProps): ServiceLeg {
    return new ServiceLeg({
      legIndex: props.legIndex,
      name: props.name,
      durationMinutes: props.durationMinutes,
      resourceRequirements: props.resourceRequirements.map((r) =>
        ResourceRequirement.reconstitute(r),
      ),
      transitionGapAfterMinutes: props.transitionGapAfterMinutes,
    });
  }

  get legIndex(): number {
    return this.props.legIndex;
  }
  get name(): string {
    return this.props.name;
  }
  get durationMinutes(): number {
    return this.props.durationMinutes;
  }
  get resourceRequirements(): ResourceRequirement[] {
    return [...this.props.resourceRequirements];
  }
  get transitionGapAfterMinutes(): number {
    return this.props.transitionGapAfterMinutes;
  }

  toJSON(): {
    legIndex: number;
    name: string;
    durationMinutes: number;
    resourceRequirements: ResourceRequirementProps[];
    transitionGapAfterMinutes: number;
  } {
    return {
      legIndex: this.props.legIndex,
      name: this.props.name,
      durationMinutes: this.props.durationMinutes,
      resourceRequirements: this.props.resourceRequirements.map((r) => r.toJSON()),
      transitionGapAfterMinutes: this.props.transitionGapAfterMinutes,
    };
  }
}
