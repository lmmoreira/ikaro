import { ValueObject } from '../../../shared/domain/value-object';
import { ResourceRequirementInvalidError } from './errors/booking-service.error';
import { ResourceType } from './resource.types';

export type ResourceRequirementSelectionMode =
  'NONE' | 'CUSTOMER_CHOICE' | 'AUTO_ANY' | 'AUTO_FUNGIBLE_POOL';

export interface ResourceRequirementProps {
  type: ResourceType;
  selectionMode: ResourceRequirementSelectionMode;
  resourcePoolIds: string[] | null;
  requiredQuantity: number;
}

export interface CreateResourceRequirementProps {
  type: ResourceType;
  selectionMode: ResourceRequirementSelectionMode;
  resourcePoolIds?: string[] | null;
  requiredQuantity?: number;
}

export class ResourceRequirement extends ValueObject<ResourceRequirementProps> {
  private constructor(props: ResourceRequirementProps) {
    super(props);
  }

  static create(props: CreateResourceRequirementProps): ResourceRequirement {
    const requiredQuantity = props.requiredQuantity ?? 1;
    if (requiredQuantity <= 0) {
      throw new ResourceRequirementInvalidError('quantity-must-be-positive');
    }
    return new ResourceRequirement({
      type: props.type,
      selectionMode: props.selectionMode,
      resourcePoolIds: props.resourcePoolIds ?? null,
      requiredQuantity,
    });
  }

  static reconstitute(props: ResourceRequirementProps): ResourceRequirement {
    return new ResourceRequirement({
      ...props,
      resourcePoolIds: props.resourcePoolIds ? [...props.resourcePoolIds] : null,
    });
  }

  get type(): ResourceType {
    return this.props.type;
  }
  get selectionMode(): ResourceRequirementSelectionMode {
    return this.props.selectionMode;
  }
  get resourcePoolIds(): string[] | null {
    return this.props.resourcePoolIds ? [...this.props.resourcePoolIds] : null;
  }
  get requiredQuantity(): number {
    return this.props.requiredQuantity;
  }

  toJSON(): ResourceRequirementProps {
    return {
      type: this.props.type,
      selectionMode: this.props.selectionMode,
      resourcePoolIds: this.resourcePoolIds,
      requiredQuantity: this.props.requiredQuantity,
    };
  }
}
