import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import {
  LeadFormQuestionLabelRequiredError,
  LeadFormQuestionLimitReachedError,
  LeadFormQuestionOptionsInvalidError,
} from './errors/lead-form-domain.error';

export type LeadFormAudienceMode = 'GUEST_AND_CUSTOMER' | 'CUSTOMER_ONLY';
export type LeadFormQuestionType = 'TEXT' | 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE';

export interface LeadFormQuestion {
  id: string;
  label: string;
  type: LeadFormQuestionType;
  required: boolean;
  options?: string[];
  order: number;
}

const MAX_QUESTIONS = 20;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 10;
const CHOICE_TYPES: ReadonlySet<LeadFormQuestionType> = new Set([
  'SINGLE_CHOICE',
  'MULTIPLE_CHOICE',
]);

export interface LeadFormConfigProps {
  tenantId: string;
  audienceMode: LeadFormAudienceMode;
  questions: LeadFormQuestion[];
  updatedAt: Date;
}

export class LeadFormConfig extends AggregateRoot {
  private readonly props: LeadFormConfigProps;

  private constructor(props: LeadFormConfigProps) {
    super();
    this.props = props;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get audienceMode(): LeadFormAudienceMode {
    return this.props.audienceMode;
  }

  get questions(): LeadFormQuestion[] {
    return [...this.props.questions];
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  static create(tenantId: string): LeadFormConfig {
    return new LeadFormConfig({
      tenantId,
      audienceMode: 'GUEST_AND_CUSTOMER',
      questions: [],
      updatedAt: new Date(),
    });
  }

  static reconstitute(props: LeadFormConfigProps): LeadFormConfig {
    return new LeadFormConfig(props);
  }

  updateAudienceMode(mode: LeadFormAudienceMode): void {
    this.props.audienceMode = mode;
    this.props.updatedAt = new Date();
  }

  /** Validates the whole array on every call (UC-037 A1/A2/A3) and replaces it atomically. */
  updateQuestions(questions: LeadFormQuestion[]): void {
    if (questions.length > MAX_QUESTIONS) throw new LeadFormQuestionLimitReachedError();
    questions.forEach((question, index) => {
      if (!question.label.trim()) throw new LeadFormQuestionLabelRequiredError(index);
      if (CHOICE_TYPES.has(question.type)) {
        const optionsCount = question.options?.length ?? 0;
        if (optionsCount < MIN_OPTIONS || optionsCount > MAX_OPTIONS) {
          throw new LeadFormQuestionOptionsInvalidError(index);
        }
      }
    });
    this.props.questions = questions;
    this.props.updatedAt = new Date();
  }
}
