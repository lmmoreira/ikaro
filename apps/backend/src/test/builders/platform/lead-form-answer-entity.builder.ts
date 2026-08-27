import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { LeadFormAnswerEntity } from '../../../contexts/platform/infrastructure/entities/lead-form-answer.entity';

export class LeadFormAnswerEntityBuilder {
  private id = uuidv7();
  private tenantId = uuidv7();
  private submissionId = uuidv7();
  private questionId = uuidv7();
  private questionLabel = 'Estado civil';
  private answerValue = 'Casado';

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withSubmissionId(submissionId: string): this {
    this.submissionId = submissionId;
    return this;
  }

  withQuestionId(questionId: string): this {
    this.questionId = questionId;
    return this;
  }

  withQuestionLabel(questionLabel: string): this {
    this.questionLabel = questionLabel;
    return this;
  }

  withAnswerValue(answerValue: string): this {
    this.answerValue = answerValue;
    return this;
  }

  build(): LeadFormAnswerEntity {
    const e = new LeadFormAnswerEntity();
    e.id = this.id;
    e.tenantId = this.tenantId;
    e.submissionId = this.submissionId;
    e.questionId = this.questionId;
    e.questionLabel = this.questionLabel;
    e.answerValue = this.answerValue;
    return e;
  }
}
