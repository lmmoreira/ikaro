import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bffServerFetch } from '@/shared/lib/api/bff-server';
import {
  getLeadFormSubmission,
  LeadFormSubmissionFetchError,
  listLeadFormSubmissions,
} from './lead-form-submissions.server';

vi.mock('@/shared/lib/api/bff-server', () => ({
  bffServerFetch: vi.fn(),
}));

describe('listLeadFormSubmissions (server)', () => {
  beforeEach(() => vi.mocked(bffServerFetch).mockReset());

  it('calls GET /tenants/lead-form/submissions with serialized page/pageSize and returns the list', async () => {
    vi.mocked(bffServerFetch).mockResolvedValue(
      new Response(JSON.stringify({ items: [], page: 2, pageSize: 20, total: 0 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await listLeadFormSubmissions('token-123', { page: 2, pageSize: 20 });

    expect(bffServerFetch).toHaveBeenCalledWith(
      'token-123',
      '/tenants/lead-form/submissions?page=2&pageSize=20',
    );
    expect(result.items).toEqual([]);
    expect(result.page).toBe(2);
  });

  it('omits the query string entirely when no params are given', async () => {
    vi.mocked(bffServerFetch).mockResolvedValue(
      new Response(JSON.stringify({ items: [], page: 1, pageSize: 20, total: 0 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await listLeadFormSubmissions('token-123');

    expect(bffServerFetch).toHaveBeenCalledWith('token-123', '/tenants/lead-form/submissions');
  });

  it('throws on a non-2xx response', async () => {
    vi.mocked(bffServerFetch).mockResolvedValue(new Response(null, { status: 500 }));

    await expect(listLeadFormSubmissions('token-123')).rejects.toThrow(
      'Failed to fetch lead form submissions (500)',
    );
  });
});

describe('getLeadFormSubmission (server)', () => {
  beforeEach(() => vi.mocked(bffServerFetch).mockReset());

  it('calls GET /tenants/lead-form/submissions/:id and returns the detail', async () => {
    const detail = {
      id: 'sub-1',
      name: 'Maria Silva',
      email: 'maria@example.com',
      phone: '+5511912345678',
      answers: [],
      submittedAt: '2026-01-01T00:00:00.000Z',
      customerId: null,
    };
    vi.mocked(bffServerFetch).mockResolvedValue(
      new Response(JSON.stringify(detail), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await getLeadFormSubmission('token-123', 'sub-1');

    expect(bffServerFetch).toHaveBeenCalledWith(
      'token-123',
      '/tenants/lead-form/submissions/sub-1',
    );
    expect(result).toEqual(detail);
  });

  it('throws LeadFormSubmissionFetchError with status/code on a 404', async () => {
    vi.mocked(bffServerFetch).mockResolvedValue(
      new Response(JSON.stringify({ code: 'PLATFORM_LEAD_FORM_SUBMISSION_NOT_FOUND' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(getLeadFormSubmission('token-123', 'unknown-id')).rejects.toThrow(
      LeadFormSubmissionFetchError,
    );
  });
});
