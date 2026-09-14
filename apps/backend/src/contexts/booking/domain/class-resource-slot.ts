import { ValueObject } from '../../../shared/domain/value-object';
import { ResourceType } from './resource.types';

// Inert this milestone (M22 Cluster 2) — nothing reads classResourceSlots until M24 ships
// ClassScheduleTemplate. No further validation beyond VO shape.
export interface ClassResourceSlotProps {
  type: ResourceType;
  eligibleResourceIds: string[];
}

export class ClassResourceSlot extends ValueObject<ClassResourceSlotProps> {
  private constructor(props: ClassResourceSlotProps) {
    super(props);
  }

  static create(props: ClassResourceSlotProps): ClassResourceSlot {
    return new ClassResourceSlot({
      type: props.type,
      eligibleResourceIds: [...props.eligibleResourceIds],
    });
  }

  static reconstitute(props: ClassResourceSlotProps): ClassResourceSlot {
    return new ClassResourceSlot({
      type: props.type,
      eligibleResourceIds: [...props.eligibleResourceIds],
    });
  }

  get type(): ResourceType {
    return this.props.type;
  }
  get eligibleResourceIds(): string[] {
    return [...this.props.eligibleResourceIds];
  }

  toJSON(): ClassResourceSlotProps {
    return { type: this.props.type, eligibleResourceIds: this.eligibleResourceIds };
  }
}
