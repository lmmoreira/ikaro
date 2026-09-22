import MockAdapter from 'axios-mock-adapter';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bffClient } from '@/shared/lib/api/bff-client';
import { fetchLeadFormConfigClient, submitLeadFormClient } from './lead-form';

const mock = new MockAdapter(bffClient);

afterEach(() => mock.reset());

describe('fetchLeadFormConfigClient', () => {
  it('returns the audienceMode + question catalog via bffClient (same-origin /v1 gateway)', async () => {
    mock.onGet('/public/platform/lead-form/lavacar-beloauto').reply(200, {
      audienceMode: 'GUEST_AND_CUSTOMER',
      questions: [{ id: 'q1', label: 'Qual serviço?', type: 'TEXT', required: true }],
    });

    const result = await fetchLeadFormConfigClient('lavacar-beloauto');

    expect(result).toEqual({
      audienceMode: 'GUEST_AND_CUSTOMER',
      questions: [{ id: 'q1', label: 'Qual serviço?', type: 'TEXT', required: true }],
    });
    expect(mock.history.get?.[0]?.headers?.['X-Tenant-Slug']).toBe('lavacar-beloauto');
  });

  it('rejects when the BFF returns an error', async () => {
    mock.onGet('/public/platform/lead-form/lavacar-beloauto').reply(404);

    await expect(fetchLeadFormConfigClient('lavacar-beloauto')).rejects.toThrow();
  });
});

const SUBMISSION_BODY = {
  name: 'Maria Silva',
  email: 'maria@example.com',
  phone: '+5511987654321',
  answers: [{ questionId: 'q1', value: 'Lavagem completa' }],
  turnstileToken: 'test-turnstile-token',
};

describe('submitLeadFormClient', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => fetchSpy?.mockRestore());

  it('posts to the same-origin Route Handler and resolves { ok: true, submissionId } on success', async () => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ submissionId: 'sub-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await submitLeadFormClient('lavacar-beloauto', SUBMISSION_BODY);

    expect(result).toEqual({ ok: true, submissionId: 'sub-1' });
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/platform/lead-form/submissions?slug=lavacar-beloauto',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(SUBMISSION_BODY),
      }),
    );
  });

  it('resolves { ok: false, status, code, field } on a non-2xx response', async () => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 'PLATFORM_LEAD_FORM_DAILY_CAP_REACHED' }), {
        status: 429,
        headers: { 'content-type': 'application/problem+json' },
      }),
    );

    const result = await submitLeadFormClient('lavacar-beloauto', SUBMISSION_BODY);

    expect(result).toEqual({
      ok: false,
      status: 429,
      code: 'PLATFORM_LEAD_FORM_DAILY_CAP_REACHED',
      field: undefined,
    });
  });

  it('resolves { ok: false, status } when the response body is not valid JSON', async () => {
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('not json', { status: 502 }));

    const result = await submitLeadFormClient('lavacar-beloauto', SUBMISSION_BODY);

    expect(result).toEqual({ ok: false, status: 502, code: undefined, field: undefined });
  });

  it('resolves { ok: false, status: 0 } on a network failure, never rejects', async () => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('connection refused'));

    await expect(submitLeadFormClient('lavacar-beloauto', SUBMISSION_BODY)).resolves.toEqual({
      ok: false,
      status: 0,
    });
  });
});
