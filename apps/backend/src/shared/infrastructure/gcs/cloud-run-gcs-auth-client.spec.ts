import { CloudRunGcsAuthClient } from './cloud-run-gcs-auth-client';

class InMemoryFetchDouble {
  readonly requests: Array<{ input: string; init?: RequestInit }> = [];

  constructor(private readonly response: Response) {}

  fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    this.requests.push({ input: String(input), init });
    return this.response.clone();
  };
}

describe('CloudRunGcsAuthClient', () => {
  const originalFetch = global.fetch;
  const originalProject = process.env['GCP_PROJECT'];

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalProject === undefined) delete process.env['GCP_PROJECT'];
    else process.env['GCP_PROJECT'] = originalProject;
  });

  it('fetches and caches a metadata access token with the required header', async () => {
    const fetchDouble = new InMemoryFetchDouble(
      new Response(JSON.stringify({ access_token: 'token', expires_in: 3600 }), { status: 200 }),
    );
    global.fetch = fetchDouble.fetch;
    const client = new CloudRunGcsAuthClient();

    await expect(client.getRequestHeaders()).resolves.toEqual({ Authorization: 'Bearer token' });
    await expect(client.getRequestHeaders()).resolves.toEqual({ Authorization: 'Bearer token' });

    expect(fetchDouble.requests).toHaveLength(1);
    expect(fetchDouble.requests[0]).toEqual({
      input: expect.stringContaining('/instance/service-accounts/default/token'),
      init: expect.objectContaining({ headers: { 'Metadata-Flavor': 'Google' } }),
    });
  });

  it('uses the configured project without a metadata request', async () => {
    process.env['GCP_PROJECT'] = 'ikaro-staging';
    const fetchDouble = new InMemoryFetchDouble(new Response('unexpected', { status: 500 }));
    global.fetch = fetchDouble.fetch;

    await expect(new CloudRunGcsAuthClient().getProjectId()).resolves.toBe('ikaro-staging');
    expect(fetchDouble.requests).toHaveLength(0);
  });

  it('falls back to the metadata project endpoint', async () => {
    delete process.env['GCP_PROJECT'];
    const fetchDouble = new InMemoryFetchDouble(new Response('ikaro-staging', { status: 200 }));
    global.fetch = fetchDouble.fetch;

    await expect(new CloudRunGcsAuthClient().getProjectId()).resolves.toBe('ikaro-staging');
    expect(fetchDouble.requests[0].input).toContain('/project/project-id');
  });
});
