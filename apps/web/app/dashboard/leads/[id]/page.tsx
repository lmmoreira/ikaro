import { notFound } from 'next/navigation';
import { getAccessToken } from '@/features/auth/get-access-token';
import {
  getLeadFormSubmission,
  LeadFormSubmissionFetchError,
} from '@/features/platform/api/lead-form-submissions.server';
import { LeadFormSubmissionDetail } from '@/features/platform/components/leads/LeadFormSubmissionDetail';
import type { LeadFormSubmissionDetailResponse } from '@ikaro/types';

interface LeadDetailRouteProps {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<{ returnTo?: string }>;
}

async function loadSubmission(
  token: string,
  id: string,
): Promise<LeadFormSubmissionDetailResponse> {
  try {
    return await getLeadFormSubmission(token, id);
  } catch (err) {
    if (err instanceof LeadFormSubmissionFetchError && err.status === 404) {
      notFound();
    }
    throw err;
  }
}

export default async function LeadDetailPage({
  params,
  searchParams,
}: LeadDetailRouteProps): Promise<React.JSX.Element> {
  const { id } = await params;
  const { returnTo } = await searchParams;
  const token = await getAccessToken();
  const submission = await loadSubmission(token, id);

  return <LeadFormSubmissionDetail submission={submission} backQuery={returnTo} />;
}
