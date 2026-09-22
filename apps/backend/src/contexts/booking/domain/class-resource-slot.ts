import { ValueObject } from '../../../shared/domain/value-object';
import { ClassResourceSlotEmptyPoolError } from './errors/booking-service.error';
import { ResourceType } from './resource.types';

// Inert this milestone (M22 Cluster 2) — nothing reads classResourceSlots until M24 ships
// ClassScheduleTemplate.
export interface ClassResourceSlotProps {
  type: ResourceType;
  eligibleResourceIds: string[];
}

export class ClassResourceSlot extends ValueObject<ClassResourceSlotProps> {
  private constructor(props: ClassResourceSlotProps) {
    super(props);
  }

  static create(props: ClassResourceSlotProps): ClassResourceSlot {
    // A slot with zero eligible resources can't round-trip through persistence (see the error
    // class's own comment in errors/booking-service.error.ts) — rejected here rather than
    // silently accepted and then lost.
    if (props.eligibleResourceIds.length === 0) throw new ClassResourceSlotEmptyPoolError();
    return new ClassResourceSlot({
      type: props.type,
      eligibleResourceIds: [...props.eligibleResourceIds],
    });
  }

  // No validation-vs-reconstitute divergence yet (inert until M24 — see the class comment above),
  // so reconstitute() intentionally delegates to create() instead of duplicating its body.
  static reconstitute(props: ClassResourceSlotProps): ClassResourceSlot {
    return ClassResourceSlot.create(props);
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
