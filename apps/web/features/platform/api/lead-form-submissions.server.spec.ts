import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bffServerFetch } from '@/shared/lib/api/bff-server';
import {
  getLeadFormFilterOptions,
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

  it('forwards a search term', async () => {
    vi.mocked(bffServerFetch).mockResolvedValue(
      new Response(JSON.stringify({ items: [], page: 1, pageSize: 20, total: 0 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await listLeadFormSubmissions('token-123', { search: 'carlos' });

    expect(bffServerFetch).toHaveBeenCalledWith(
      'token-123',
      '/tenants/lead-form/submissions?search=carlos',
    );
  });

  it('forwards filters as a JSON-encoded array query param', async () => {
    vi.mocked(bffServerFetch).mockResolvedValue(
      new Response(JSON.stringify({ items: [], page: 1, pageSize: 20, total: 0 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const filters = [{ questionLabel: 'Estado civil', value: 'casado' }];

    await listLeadFormSubmissions('token-123', { filters });

    const expectedQuery = new URLSearchParams({ filters: JSON.stringify(filters) }).toString();
    expect(bffServerFetch).toHaveBeenCalledWith(
      'token-123',
      `/tenants/lead-form/submissions?${expectedQuery}`,
    );
  });

  it('omits an empty filters array', async () => {
    vi.mocked(bffServerFetch).mockResolvedValue(
      new Response(JSON.stringify({ items: [], page: 1, pageSize: 20, total: 0 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await listLeadFormSubmissions('token-123', { filters: [] });

    expect(bffServerFetch).toHaveBeenCalledWith('token-123', '/tenants/lead-form/submissions');
  });

  it('forwards submittedFrom/submittedTo', async () => {
    vi.mocked(bffServerFetch).mockResolvedValue(
      new Response(JSON.stringify({ items: [], page: 1, pageSize: 20, total: 0 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await listLeadFormSubmissions('token-123', {
      submittedFrom: '2026-08-01',
      submittedTo: '2026-08-15',
    });

    expect(bffServerFetch).toHaveBeenCalledWith(
      'token-123',
      '/tenants/lead-form/submissions?submittedFrom=2026-08-01&submittedTo=2026-08-15',
    );
  });
});

describe('getLeadFormFilterOptions (server)', () => {
  beforeEach(() => vi.mocked(bffServerFetch).mockReset());

  it('calls GET /tenants/lead-form/submissions/filter-options and returns the question labels', async () => {
    vi.mocked(bffServerFetch).mockResolvedValue(
      new Response(JSON.stringify({ questionLabels: ['Estado civil', 'Onde você mora?'] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await getLeadFormFilterOptions('token-123');

    expect(bffServerFetch).toHaveBeenCalledWith(
      'token-123',
      '/tenants/lead-form/submissions/filter-options',
    );
    expect(result.questionLabels).toEqual(['Estado civil', 'Onde você mora?']);
  });

  it('throws on a non-2xx response', async () => {
    vi.mocked(bffServerFetch).mockResolvedValue(new Response(null, { status: 500 }));

    await expect(getLeadFormFilterOptions('token-123')).rejects.toThrow(
      'Failed to fetch lead form filter options (500)',
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
