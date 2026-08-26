import { Inject, Injectable } from '@nestjs/common';
import {
  ILeadFormSubmissionRepository,
  LEAD_FORM_SUBMISSION_REPOSITORY,
} from '../ports/lead-form-submission-repository.port';

export interface ListLeadFormSubmissionsUseCaseInput {
  tenantId: string;
  page: number;
  pageSize: number;
}

export interface LeadFormSubmissionListItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  submittedAt: string;
}

export interface ListLeadFormSubmissionsUseCaseResult {
  items: LeadFormSubmissionListItem[];
  page: number;
  pageSize: number;
  total: number;
}

/** UC-041 main flow steps 1-2 — paginated admin list, ordered submittedAt DESC. */
@Injectable()
export class ListLeadFormSubmissionsUseCase {
  constructor(
    @Inject(LEAD_FORM_SUBMISSION_REPOSITORY)
    private readonly submissionRepo: ILeadFormSubmissionRepository,
  ) {}

  async execute(
    input: ListLeadFormSubmissionsUseCaseInput,
  ): Promise<ListLeadFormSubmissionsUseCaseResult> {
    const { tenantId, page, pageSize } = input;
    const { items, total } = await this.submissionRepo.findByTenantPaginated(
      tenantId,
      page,
      pageSize,
    );

    return {
      items: items.map((submission) => ({
        id: submission.id,
        name: submission.name,
        email: submission.email.address,
        phone: submission.phone.value,
        submittedAt: submission.submittedAt.toISOString(),
      })),
      page,
      pageSize,
      total,
    };
  }
}
